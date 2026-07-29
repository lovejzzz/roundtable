import assert from "node:assert/strict";
import { appendFile, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createHistoryStore,
  resolveHistoryDirectory,
} from "../scripts/history-store.mjs";

function creationEvent(id, overrides = {}) {
  return {
    type: "session.created",
    session: {
      id,
      phase: "starting",
      projectPath: "/private/project",
      topic: "Preserve this discussion",
      codexModel: "codex-test",
      claudeModel: "claude-test",
      codexEffort: "high",
      claudeEffort: "high",
      totalTurns: 2,
      completedTurns: 0,
      messages: [],
      outcome: null,
      pendingSteering: [],
      historyWarning: "",
      lastStatus: {
        type: "session.status",
        status: "running",
        turn: 0,
        totalTurns: 2,
      },
      createdAt: "2026-07-29T12:00:00.000Z",
      ...overrides,
    },
  };
}

test("stores owner-only event logs and restores a completed snapshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "roundtable-history-"));
  const id = "history-test-0001";
  const store = createHistoryStore({
    directory,
    now: () => new Date("2026-07-29T12:05:00.000Z"),
  });

  try {
    await store.initialize();
    await store.append(id, {
      ...creationEvent(id),
      token: "bridge-token-secret",
      ticket: "sse-ticket-secret",
      nested: {
        authorization: "Bearer nested-secret",
        credential: "credential-secret",
      },
    });
    await store.append(id, {
      type: "message",
      message: {
        id: "message-1",
        author: "Codex",
        role: "codex",
        body: "A private repository-derived observation.",
        at: "2026-07-29T12:01:00.000Z",
        round: 1,
      },
    });
    await store.append(id, {
      type: "session.outcome",
      outcome: {
        status: "available",
        decision: "Keep the archive local.",
        rationale: "Privacy.",
        actions: [],
        openQuestions: [],
        consensus: true,
        coverage: {
          truncated: false,
          includedCharacters: 10,
          totalCharacters: 10,
          messageCount: 1,
        },
        synthesizedBy: "Codex",
      },
    });
    await store.append(id, {
      type: "session.status",
      status: "complete",
      turn: 2,
      totalTurns: 2,
    });

    const [record] = await store.list();
    assert.equal(record.status, "complete");
    assert.equal(record.messageCount, 1);
    assert.equal(record.hasOutcome, true);
    assert.equal(JSON.stringify(record).includes("private repository-derived"), false);

    const snapshot = await store.get(id);
    assert.equal(snapshot.phase, "complete");
    assert.equal(snapshot.messages[0].body, "A private repository-derived observation.");
    assert.equal(snapshot.outcome.decision, "Keep the archive local.");

    const directoryMode = (await stat(directory)).mode & 0o777;
    const logMode = (await stat(join(directory, `${id}.ndjson`))).mode & 0o777;
    assert.equal(directoryMode, 0o700);
    assert.equal(logMode, 0o600);
    const raw = await readFile(join(directory, `${id}.ndjson`), "utf8");
    assert.doesNotMatch(raw, /Bearer|ticket|bridge key/i);
    assert.doesNotMatch(raw, /bridge-token-secret|nested-secret|credential-secret/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("marks restarted work interrupted and keeps undelivered steering outside the transcript", async () => {
  const directory = await mkdtemp(join(tmpdir(), "roundtable-history-"));
  const id = "history-test-0002";
  const firstStore = createHistoryStore({
    directory,
    now: () => new Date("2026-07-29T12:05:00.000Z"),
  });

  try {
    await firstStore.append(id, creationEvent(id));
    await firstStore.append(id, {
      type: "steering.queued",
      message: {
        id: "steering-1",
        author: "You",
        role: "human",
        body: "Never delivered",
        at: "2026-07-29T12:02:00.000Z",
      },
      targetTurn: 1,
    });
    await firstStore.append(id, {
      type: "session.status",
      status: "running",
      turn: 0,
      totalTurns: 2,
    });

    const restartedStore = createHistoryStore({
      directory,
      now: () => new Date("2026-07-29T12:10:00.000Z"),
    });
    await restartedStore.initialize();
    const snapshot = await restartedStore.get(id);
    assert.equal(snapshot.phase, "interrupted");
    assert.equal(snapshot.lastStatus.status, "interrupted");
    assert.equal(snapshot.messages.length, 0);
    assert.equal(snapshot.pendingSteering[0].body, "Never delivered");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("recovers the valid prefix when the final event line is torn", async () => {
  const directory = await mkdtemp(join(tmpdir(), "roundtable-history-"));
  const id = "history-test-torn-0001";
  const store = createHistoryStore({ directory });

  try {
    await store.append(id, creationEvent(id));
    await store.append(id, {
      type: "message",
      message: {
        id: "message-before-crash",
        author: "Claude",
        role: "claude",
        body: "This complete event must survive.",
        at: "2026-07-29T12:03:00.000Z",
        round: 1,
      },
    });
    await appendFile(join(directory, `${id}.ndjson`), '{"type":"message","message":');

    const snapshot = await store.get(id);
    assert.equal(snapshot.messages.length, 1);
    assert.equal(snapshot.messages[0].body, "This complete event must survive.");
    assert.match(snapshot.historyWarning, /valid prefix was recovered/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("applies count retention and supports exact deletion and clearing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "roundtable-history-"));
  let minute = 0;
  const store = createHistoryStore({
    directory,
    maxRecords: 2,
    maxAgeMs: 24 * 60 * 60 * 1000,
    now: () => new Date(`2026-07-29T12:${String(minute++).padStart(2, "0")}:00.000Z`),
  });

  try {
    for (const id of ["history-test-1001", "history-test-1002", "history-test-1003"]) {
      await store.append(id, creationEvent(id, { topic: id }));
      await store.append(id, {
        type: "session.status",
        status: "complete",
        turn: 2,
        totalTurns: 2,
      });
    }
    const records = await store.list();
    assert.equal(records.length, 2);
    assert.equal(records.some((record) => record.id === "history-test-1001"), false);
    assert.equal(await store.delete("history-test-1002"), true);
    assert.equal(await store.delete("history-test-1002"), false);
    assert.equal((await store.list()).length, 1);
    assert.equal(await store.clear(), 1);
    assert.equal((await store.list()).length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("resolves history outside a project-oriented path", () => {
  assert.equal(
    resolveHistoryDirectory({
      platform: "darwin",
      home: "/Users/example",
      env: {},
    }),
    "/Users/example/Library/Application Support/Roundtable/history",
  );
  assert.equal(
    resolveHistoryDirectory({
      platform: "linux",
      home: "/home/example",
      env: { XDG_DATA_HOME: "/data/example" },
    }),
    "/data/example/roundtable/history",
  );
});
