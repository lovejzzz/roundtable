import {
  appendFile,
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { redactVisibleString } from "./redaction.mjs";

const TERMINAL_HISTORY_STATUSES = new Set(["complete", "stopped", "error", "interrupted"]);
const DEFAULT_MAX_RECORDS = 50;
const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PRIVATE_EVENT_FIELD = /^(?:authorization|bridgeKey|credential|sseTicket|ticket|token)$/i;

export function resolveHistoryDirectory({
  env = process.env,
  platform = process.platform,
  home = homedir(),
} = {}) {
  if (env.ROUNDTABLE_HISTORY_DIR) return env.ROUNDTABLE_HISTORY_DIR;
  if (platform === "darwin") {
    return join(home, "Library", "Application Support", "Roundtable", "history");
  }
  if (platform === "win32") {
    return join(env.LOCALAPPDATA || join(home, "AppData", "Local"), "Roundtable", "history");
  }
  return join(env.XDG_DATA_HOME || join(home, ".local", "share"), "roundtable", "history");
}

function safeRecordId(id) {
  const value = String(id || "");
  if (!/^[A-Za-z0-9-]{8,80}$/.test(value)) throw new Error("Invalid history record ID.");
  return value;
}

function projectName(projectPath) {
  const normalized = String(projectPath || "").replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]/).pop() || normalized || "Project";
}

function baseIndex() {
  return { version: 1, records: [] };
}

function sanitizeEventValue(value) {
  if (typeof value === "string") return redactVisibleString(value);
  if (Array.isArray(value)) return value.map(sanitizeEventValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PRIVATE_EVENT_FIELD.test(key))
      .map(([key, child]) => [key, sanitizeEventValue(child)]),
  );
}

function applyMetadataEvent(record, event, timestamp) {
  if (event.type === "session.created") {
    const session = event.session;
    return {
      id: session.id,
      topic: session.topic,
      projectName: projectName(session.projectPath),
      createdAt: session.createdAt || timestamp,
      updatedAt: timestamp,
      status: "running",
      totalTurns: session.totalTurns,
      messageCount: 0,
      hasOutcome: false,
      historyWarning: "",
    };
  }
  if (!record) return record;
  const next = { ...record, updatedAt: timestamp };
  if (event.type === "message") next.messageCount = (next.messageCount || 0) + 1;
  if (event.type === "session.outcome") next.hasOutcome = true;
  if (event.type === "session.status") next.status = event.status;
  if (event.type === "history.warning") next.historyWarning = event.message;
  return next;
}

function reconstructSnapshot(events, record) {
  let snapshot = null;
  const messages = [];
  const pending = new Map();
  let outcome = null;
  let lastStatus = null;
  let historyWarning = record?.historyWarning || "";

  for (const event of events) {
    if (event.type === "session.created") {
      snapshot = {
        ...event.session,
        messages: [],
        outcome: null,
        pendingSteering: [],
        historyWarning: "",
      };
    } else if (event.type === "message") {
      if (!messages.some((message) => message.id === event.message?.id)) {
        messages.push(event.message);
      }
    } else if (event.type === "session.outcome") {
      outcome = event.outcome;
    } else if (event.type === "session.status") {
      lastStatus = event;
    } else if (event.type === "steering.queued") {
      pending.set(event.message.id, event.message);
    } else if (event.type === "steering.committed") {
      pending.delete(event.messageId);
    } else if (event.type === "history.warning") {
      historyWarning = event.message;
    }
  }

  if (!snapshot) throw new Error("History record is missing its creation event.");
  const interrupted = record?.status === "interrupted";
  const finalStatus = interrupted
    ? {
        type: "session.status",
        status: "interrupted",
        turn: snapshot.completedTurns || messages.filter((message) => message.round).length,
        totalTurns: snapshot.totalTurns,
        note: "The bridge stopped before this discussion finished.",
      }
    : lastStatus || snapshot.lastStatus;
  return {
    ...snapshot,
    phase: interrupted ? "interrupted" : record?.status || snapshot.phase,
    completedTurns:
      finalStatus?.turn ?? snapshot.completedTurns ?? messages.filter((message) => message.round).length,
    messages,
    outcome,
    pendingSteering: [...pending.values()],
    lastStatus: finalStatus,
    historyWarning,
    archived: true,
  };
}

export function createHistoryStore({
  directory = resolveHistoryDirectory(),
  enabled = process.env.ROUNDTABLE_HISTORY !== "off",
  now = () => new Date(),
  maxRecords = DEFAULT_MAX_RECORDS,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
} = {}) {
  const indexPath = join(directory, "index.json");
  let index = baseIndex();
  let initialized = false;
  let operation = Promise.resolve();

  function eventPath(id) {
    return join(directory, `${safeRecordId(id)}.ndjson`);
  }

  async function writeIndex() {
    const temporary = `${indexPath}.tmp`;
    await writeFile(temporary, `${JSON.stringify(index, null, 2)}\n`, { mode: 0o600 });
    await chmod(temporary, 0o600);
    await rename(temporary, indexPath);
  }

  async function prune() {
    const cutoff = now().getTime() - maxAgeMs;
    const ordered = [...index.records].sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );
    const retained = ordered.filter(
      (record, position) =>
        position < maxRecords && new Date(record.updatedAt).getTime() >= cutoff,
    );
    const retainedIds = new Set(retained.map((record) => record.id));
    const removed = index.records.filter((record) => !retainedIds.has(record.id));
    index.records = retained;
    await Promise.all(removed.map((record) => rm(eventPath(record.id), { force: true })));
  }

  async function initialize() {
    if (!enabled || initialized) return;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    try {
      const parsed = JSON.parse(await readFile(indexPath, "utf8"));
      index =
        parsed?.version === 1 && Array.isArray(parsed.records)
          ? { version: 1, records: parsed.records }
          : baseIndex();
    } catch (error) {
      if (error?.code !== "ENOENT") {
        const quarantine = join(dirname(indexPath), `index.corrupt-${Date.now()}.json`);
        await rename(indexPath, quarantine).catch(() => {});
      }
      index = baseIndex();
    }

    const interruptedAt = now().toISOString();
    let changed = false;
    for (const record of index.records) {
      if (!TERMINAL_HISTORY_STATUSES.has(record.status)) {
        record.status = "interrupted";
        record.updatedAt = interruptedAt;
        await appendFile(
          eventPath(record.id),
          `${JSON.stringify({
            type: "session.status",
            status: "interrupted",
            at: interruptedAt,
          })}\n`,
          { mode: 0o600 },
        ).catch(() => {});
        changed = true;
      }
    }
    const beforePrune = index.records.length;
    await prune();
    if (changed || beforePrune !== index.records.length || index.records.length) {
      await writeIndex();
    }
    initialized = true;
  }

  function serialize(work) {
    const next = operation.then(work, work);
    operation = next.catch(() => {});
    return next;
  }

  return {
    enabled,
    directory,
    retention: {
      maxRecords,
      maxDays: Math.round(maxAgeMs / (24 * 60 * 60 * 1000)),
    },
    async initialize() {
      return serialize(initialize);
    },
    async append(id, event) {
      if (!enabled) return;
      return serialize(async () => {
        await initialize();
        const recordId = safeRecordId(id);
        const timestamp = event.at || now().toISOString();
        const persistedEvent = sanitizeEventValue({ ...event, at: timestamp });
        await appendFile(eventPath(recordId), `${JSON.stringify(persistedEvent)}\n`, {
          mode: 0o600,
        });
        await chmod(eventPath(recordId), 0o600);
        const position = index.records.findIndex((record) => record.id === recordId);
        const current = position >= 0 ? index.records[position] : null;
        const updated = applyMetadataEvent(current, persistedEvent, timestamp);
        if (updated && position >= 0) index.records[position] = updated;
        else if (updated) index.records.push(updated);
        await prune();
        await writeIndex();
      });
    },
    async list() {
      if (!enabled) return [];
      await serialize(initialize);
      return [...index.records]
        .sort(
          (left, right) =>
            new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
        )
        .map((record) => ({ ...record }));
    },
    async get(id) {
      if (!enabled) return null;
      await serialize(initialize);
      const recordId = safeRecordId(id);
      const record = index.records.find((item) => item.id === recordId);
      if (!record) return null;
      const raw = await readFile(eventPath(recordId), "utf8");
      const events = [];
      let incomplete = false;
      for (const line of raw.split("\n").filter(Boolean)) {
        try {
          events.push(JSON.parse(line));
        } catch {
          incomplete = true;
          break;
        }
      }
      const snapshot = reconstructSnapshot(events, record);
      if (incomplete) {
        const recoveryWarning =
          "History incomplete: the last stored event was damaged; the valid prefix was recovered.";
        snapshot.historyWarning = [snapshot.historyWarning, recoveryWarning]
          .filter(Boolean)
          .join(" ");
      }
      return snapshot;
    },
    async delete(id) {
      if (!enabled) return false;
      return serialize(async () => {
        await initialize();
        const recordId = safeRecordId(id);
        const before = index.records.length;
        index.records = index.records.filter((record) => record.id !== recordId);
        if (index.records.length === before) return false;
        await rm(eventPath(recordId), { force: true });
        await writeIndex();
        return true;
      });
    },
    async clear() {
      if (!enabled) return 0;
      return serialize(async () => {
        await initialize();
        const records = [...index.records];
        await Promise.all(records.map((record) => rm(eventPath(record.id), { force: true })));
        index.records = [];
        await writeIndex();
        return records.length;
      });
    },
  };
}
