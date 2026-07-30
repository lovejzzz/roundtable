import assert from "node:assert/strict";
import {
  access,
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
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
      antigravityModel: "gemini-test",
      codexEffort: "high",
      claudeEffort: "high",
      antigravityEffort: "medium",
      totalTurns: 3,
      completedTurns: 0,
      messages: [],
      outcome: null,
      pendingSteering: [],
      historyWarning: "",
      lastStatus: {
        type: "session.status",
        status: "running",
        turn: 0,
        totalTurns: 3,
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
    const attachmentManifestId = `sha256:${"d".repeat(64)}`;
    await store.initialize();
    await store.append(id, {
      ...creationEvent(id, {
        attachments: [
          {
            name: "brief.txt",
            mediaType: "text/plain",
            size: 8,
            path: ".roundtable-attachments/1-brief.txt",
          },
        ],
        attachmentManifestId,
      }),
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
        checks: [
          {
            command: "npm test token=history-secret-value",
            status: "passed",
            summary: "Bearer history-bearer-secret completed.",
            round: 1,
            exitCode: 0,
          },
        ],
      },
    });
    await store.append(id, {
      type: "session.batch",
      batch: {
        phase: "sealed-opening",
        inputHash: `sha256:${"a".repeat(64)}`,
        roles: {
          codex: { role: "codex", status: "completed", messageId: "message-1" },
        },
      },
    });
    await store.append(id, {
      type: "session.audit",
      audit: {
        status: "complete",
        reviews: {
          claude: {
            role: "claude",
            status: "completed",
            concerns: [],
          },
        },
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
      type: "session.dissent",
      review: {
        role: "claude",
        author: "Claude",
        status: "completed",
        at: "2026-07-29T12:04:00.000Z",
        coverage: {
          truncated: false,
          includedCharacters: 10,
          totalCharacters: 10,
          messageCount: 1,
        },
        itemCount: 1,
      },
      items: [
        {
          id: "D1",
          author: "Claude",
          role: "claude",
          at: "2026-07-29T12:04:00.000Z",
          messageLabel: "M1",
          position: "reject",
          summary: "Keep this dissent.",
          reason: "It could be missed.",
        },
      ],
    });
    await store.append(id, {
      type: "dissent.judged",
      dissentId: "D1",
      verdict: "represented",
      judgedAt: "2026-07-29T12:04:30.000Z",
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
    assert.match(snapshot.messages[0].checks[0].command, /token=\[redacted\]/);
    assert.match(snapshot.messages[0].checks[0].summary, /Bearer \[redacted\]/);
    assert.equal(snapshot.outcome.decision, "Keep the archive local.");
    assert.equal(snapshot.sealedBatch.roles.codex.status, "completed");
    assert.equal(snapshot.briefAudit.reviews.claude.status, "completed");
    assert.equal(snapshot.dissent[0].summary, "Keep this dissent.");
    assert.equal(snapshot.dissentReviews.claude.status, "completed");
    assert.equal(snapshot.dissentJudgments.D1.verdict, "represented");
    assert.equal(snapshot.attachmentManifestId, attachmentManifestId);

    const directoryMode = (await stat(directory)).mode & 0o777;
    const logMode = (await stat(join(directory, `${id}.ndjson`))).mode & 0o777;
    assert.equal(directoryMode, 0o700);
    assert.equal(logMode, 0o600);
    const raw = await readFile(join(directory, `${id}.ndjson`), "utf8");
    assert.doesNotMatch(raw, /"ticket"|bridge key/i);
    assert.doesNotMatch(
      raw,
      /bridge-token-secret|nested-secret|credential-secret|history-secret-value|history-bearer-secret/,
    );
    assert.match(raw, new RegExp(attachmentManifestId));
    assert.doesNotMatch(raw, /contentBase64|attachmentPayloads|YXR0YWNoZWQgZmlsZQ==/);
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
      status: "failed",
      turn: 0,
      totalTurns: 2,
      failedTurn: {
        turn: 0,
        role: "codex",
        safeError: "Temporary provider failure.",
        attempts: 1,
        failedAt: "2026-07-29T12:03:00.000Z",
        expiresAt: "2026-07-29T12:18:00.000Z",
      },
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
    assert.equal(snapshot.failedTurn ?? null, null);
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

test("rejects non-creation writes after deletion without recreating transcript bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "roundtable-history-"));
  const id = "history-test-deleted-0001";
  const store = createHistoryStore({ directory });
  const eventFile = join(directory, `${id}.ndjson`);

  try {
    await store.append(id, creationEvent(id));
    assert.equal(await store.delete(id), true);
    await assert.rejects(
      store.append(id, {
        type: "dissent.judged",
        dissentId: "D1",
        verdict: "missed",
      }),
      (error) => error?.code === "HISTORY_RECORD_MISSING",
    );
    await assert.rejects(access(eventFile), (error) => error?.code === "ENOENT");

    const restartedStore = createHistoryStore({ directory });
    assert.deepEqual(await restartedStore.list(), []);
    await assert.rejects(access(eventFile), (error) => error?.code === "ENOENT");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("does not remove transcript bytes when the replacement index cannot commit", async () => {
  const directory = await mkdtemp(join(tmpdir(), "roundtable-history-"));
  const id = "history-test-index-failure-0001";
  const store = createHistoryStore({ directory });
  const eventFile = join(directory, `${id}.ndjson`);

  try {
    await store.append(id, creationEvent(id));
    await mkdir(join(directory, "index.json.tmp"));
    await assert.rejects(store.delete(id), (error) => /EISDIR/.test(error?.code || ""));
    assert.equal((await store.list()).length, 1);
    await access(eventFile);
    await assert.rejects(store.clear(), (error) => error?.code === "EISDIR");
    assert.equal((await store.list()).length, 1);
    await access(eventFile);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("restores the durable index when transcript removal fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "roundtable-history-"));
  const id = "history-test-remove-failure-0001";
  const store = createHistoryStore({ directory });
  const eventFile = join(directory, `${id}.ndjson`);

  try {
    await store.append(id, creationEvent(id));
    await rm(eventFile);
    await mkdir(eventFile);

    await assert.rejects(store.delete(id), (error) => /EISDIR/.test(error?.code || ""));
    assert.equal((await store.list())[0].id, id);
    const persistedIndex = JSON.parse(await readFile(join(directory, "index.json"), "utf8"));
    assert.equal(persistedIndex.records[0].id, id);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("drops indexed metadata for missing transcripts without recreating history bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "roundtable-history-"));
  const id = "history-test-missing-file-0001";
  const store = createHistoryStore({ directory });
  const eventFile = join(directory, `${id}.ndjson`);

  try {
    await store.append(id, creationEvent(id));
    await rm(eventFile);

    const restartedStore = createHistoryStore({
      directory,
      now: () => new Date("2026-07-29T12:10:00.000Z"),
    });
    await restartedStore.initialize();
    assert.deepEqual(await restartedStore.list(), []);
    assert.equal(await restartedStore.get(id), null);
    await assert.rejects(access(eventFile), (error) => error?.code === "ENOENT");
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
