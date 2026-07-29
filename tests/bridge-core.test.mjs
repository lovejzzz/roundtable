import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOutcomeInput,
  createBridge,
  extractOutcomeJson,
} from "../scripts/bridge-core.mjs";

const token = "test-bridge-token";
const health = {
  projectWriteGuard: true,
  models: {
    codex: {
      configured: "codex-test",
      effort: "high",
      efforts: ["low", "medium", "high"],
    },
    claude: {
      configured: "claude-test",
      effort: "high",
      efforts: ["low", "medium", "high"],
    },
  },
  codex: { available: true, version: "codex-test" },
  claude: { available: true, version: "claude-test" },
};

function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function waitFor(check, timeoutMs = 2_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for test state.");
}

async function startTestBridge(agentRunner, options = {}) {
  const { server, sessions } = createBridge({
    token,
    defaultProject: "/test/project",
    health,
    agentRunner,
    resolveProject: async () => "/test/project",
    sessionTtlMs: 5_000,
    failedTurnTtlMs: options.failedTurnTtlMs,
    historyStore: options.historyStore,
    maxSessions: options.maxSessions,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    sessions,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("queues steering after the active reply and includes it once in the next prompt", async () => {
  let releaseFirstTurn;
  const prompts = [];
  let callCount = 0;
  const agentRunner = {
    run({ prompt }) {
      prompts.push(prompt);
      callCount += 1;
      if (callCount === 1) {
        return new Promise((resolve) => {
          releaseFirstTurn = () => resolve("first agent reply");
        });
      }
      return Promise.resolve(`agent reply ${callCount}`);
    },
    stop() {
      return Promise.resolve();
    },
  };
  const bridge = await startTestBridge(agentRunner);

  try {
    const createResponse = await fetch(`${bridge.baseUrl}/sessions`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        projectPath: "/test/project",
        topic: "Improve the app",
        rounds: 2,
      }),
    });
    assert.equal(createResponse.status, 201);
    const { id } = await createResponse.json();
    await waitFor(() => releaseFirstTurn);

    for (const text of ["Prioritize reliability.", "Keep the transcript chronological."]) {
      const steerResponse = await fetch(`${bridge.baseUrl}/sessions/${id}/steer`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ text }),
      });
      assert.equal(steerResponse.status, 202);
    }
    releaseFirstTurn();

    const completed = await waitFor(async () => {
      const response = await fetch(`${bridge.baseUrl}/sessions/${id}`, {
        headers: authHeaders(),
      });
      const snapshot = await response.json();
      return snapshot.phase === "complete" ? snapshot : null;
    });

    assert.deepEqual(
      completed.messages.slice(0, 4).map((message) => message.role),
      ["codex", "human", "human", "claude"],
    );
    assert.doesNotMatch(prompts[0], /Prioritize reliability/);
    assert.match(prompts[1], /Prioritize reliability/);
    assert.equal(prompts[1].match(/Prioritize reliability/g)?.length, 1);

    const lateSteer = await fetch(`${bridge.baseUrl}/sessions/${id}/steer`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ text: "Too late" }),
    });
    assert.equal(lateSteer.status, 409);
  } finally {
    await bridge.close();
  }
});

test("restores snapshots and closes terminal SSE streams after replay", async () => {
  let cleanupCalls = 0;
  const agentRunner = {
    run: async ({ role, purpose }) =>
      purpose === "synthesis"
        ? `\`\`\`json
{"decision":"Ship the brief","rationale":"It makes the transcript actionable.","actions":[{"owner":"Codex","text":"Implement it."}],"openQuestions":[],"consensus":true}
\`\`\``
        : `${role} reply`,
    stop: async () => {},
    cleanup: async () => {
      cleanupCalls += 1;
    },
  };
  const bridge = await startTestBridge(agentRunner);

  try {
    const createResponse = await fetch(`${bridge.baseUrl}/sessions`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        projectPath: "/test/project",
        topic: "Test recovery",
        rounds: 1,
      }),
    });
    const { id } = await createResponse.json();
    const snapshot = await waitFor(async () => {
      const response = await fetch(`${bridge.baseUrl}/sessions/${id}`, {
        headers: authHeaders(),
      });
      const value = await response.json();
      return value.phase === "complete" ? value : null;
    });
    assert.equal(snapshot.messages.length, 2);
    assert.equal(snapshot.outcome.status, "available");
    assert.equal(snapshot.outcome.synthesizedBy, "Codex");
    assert.equal(snapshot.outcome.actions[0].owner, "Codex");

    const ticketResponse = await fetch(`${bridge.baseUrl}/sessions/${id}/ticket`, {
      method: "POST",
      headers: authHeaders(),
    });
    const { ticket } = await ticketResponse.json();
    const streamResponse = await fetch(
      `${bridge.baseUrl}/sessions/${id}/events?ticket=${encodeURIComponent(ticket)}`,
    );
    const replay = await streamResponse.text();
    assert.match(replay, /codex reply/);
    assert.match(replay, /"type":"session.outcome"/);
    assert.match(replay, /"status":"complete"/);
    assert.ok(
      replay.indexOf('"type":"session.outcome"') < replay.indexOf('"status":"complete"'),
      "the persisted outcome replays before terminal status",
    );
    await waitFor(async () => (cleanupCalls === 1 ? true : null));
  } finally {
    await bridge.close();
  }
});

test("builds coverage-aware outcome input and validates fenced JSON", () => {
  const input = buildOutcomeInput(
    "Choose the next feature",
    [
      { author: "Codex", round: 1, body: "A".repeat(2_000) },
      { author: "Claude", round: 1, body: "B".repeat(2_000) },
    ],
    1_200,
  );
  assert.equal(input.coverage.truncated, true);
  assert.equal(input.coverage.messageCount, 2);
  assert.match(input.text, /MESSAGE 1 · Codex/);
  assert.match(input.text, /MESSAGE 2 · Claude/);

  const outcome = extractOutcomeJson(`\`\`\`json
{"decision":"Add an outcome","rationale":"It creates actionability.","actions":[{"owner":"You","text":"Review the result."}],"openQuestions":["How should retry work?"],"consensus":false}
\`\`\``);
  assert.equal(outcome.status, "available");
  assert.equal(outcome.consensus, false);
  assert.equal(outcome.actions[0].owner, "You");
  assert.throws(() => extractOutcomeJson("not json"), /JSON object/);
  assert.throws(
    () =>
      extractOutcomeJson(
        '{"decision":"x","rationale":"y","actions":[{"owner":"Human","text":"z"}],"openQuestions":[],"consensus":true}',
      ),
    /invalid action item/,
  );
});

test("a synthesis failure preserves the transcript and completes with an unavailable outcome", async () => {
  const agentRunner = {
    run: async ({ role, purpose }) => {
      if (purpose === "synthesis") throw new Error("synthetic test failure");
      return `${role} reply`;
    },
    stop: async () => {},
  };
  const bridge = await startTestBridge(agentRunner);

  try {
    const createResponse = await fetch(`${bridge.baseUrl}/sessions`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        projectPath: "/test/project",
        topic: "Test synthesis failure",
        rounds: 1,
      }),
    });
    const { id } = await createResponse.json();
    const snapshot = await waitFor(async () => {
      const response = await fetch(`${bridge.baseUrl}/sessions/${id}`, {
        headers: authHeaders(),
      });
      const value = await response.json();
      return value.phase === "complete" ? value : null;
    });
    assert.equal(snapshot.messages.length, 2);
    assert.equal(snapshot.outcome.status, "unavailable");
    assert.equal(snapshot.outcome.reason, "failed");
    assert.match(snapshot.outcome.message, /synthetic test failure/);
  } finally {
    await bridge.close();
  }
});

test("stopping during synthesis skips only the brief", async () => {
  let rejectSynthesis;
  const agentRunner = {
    run: async ({ role, purpose }) => {
      if (purpose !== "synthesis") return `${role} reply`;
      return new Promise((resolve, reject) => {
        rejectSynthesis = reject;
      });
    },
    stop: async () => {
      const error = new Error("Discussion stopped.");
      error.code = "USER_STOP";
      rejectSynthesis?.(error);
    },
  };
  const bridge = await startTestBridge(agentRunner);

  try {
    const createResponse = await fetch(`${bridge.baseUrl}/sessions`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        projectPath: "/test/project",
        topic: "Test synthesis skip",
        rounds: 1,
      }),
    });
    const { id } = await createResponse.json();
    await waitFor(() => rejectSynthesis);

    const stopResponse = await fetch(`${bridge.baseUrl}/sessions/${id}/stop`, {
      method: "POST",
      headers: authHeaders(),
    });
    assert.equal(stopResponse.status, 202);
    assert.equal((await stopResponse.json()).skippingOutcome, true);

    const snapshot = await waitFor(async () => {
      const response = await fetch(`${bridge.baseUrl}/sessions/${id}`, {
        headers: authHeaders(),
      });
      const value = await response.json();
      return value.phase === "complete" ? value : null;
    });
    assert.equal(snapshot.messages.length, 2);
    assert.equal(snapshot.outcome.reason, "skipped");
  } finally {
    await bridge.close();
  }
});

test("a stop accepted before process registration prevents agent work from starting", async () => {
  let releaseRunner;
  let runnerEntered = false;
  let launchedWork = 0;
  const agentRunner = {
    async run({ session }) {
      runnerEntered = true;
      await new Promise((resolve) => {
        releaseRunner = resolve;
      });
      if (session.stopRequested) {
        const error = new Error("Discussion stopped.");
        error.code = "USER_STOP";
        throw error;
      }
      launchedWork += 1;
      return "unexpected reply";
    },
    stop: async () => {},
  };
  const bridge = await startTestBridge(agentRunner);

  try {
    const createResponse = await fetch(`${bridge.baseUrl}/sessions`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        projectPath: "/test/project",
        topic: "Test early stop",
        rounds: 1,
      }),
    });
    const { id } = await createResponse.json();
    await waitFor(() => runnerEntered);

    const stopResponse = await fetch(`${bridge.baseUrl}/sessions/${id}/stop`, {
      method: "POST",
      headers: authHeaders(),
    });
    assert.equal(stopResponse.status, 202);
    releaseRunner();

    const stopped = await waitFor(async () => {
      const response = await fetch(`${bridge.baseUrl}/sessions/${id}`, {
        headers: authHeaders(),
      });
      const snapshot = await response.json();
      return snapshot.phase === "stopped" ? snapshot : null;
    });
    assert.equal(stopped.phase, "stopped");
    assert.equal(stopped.outcome.reason, "stopped");
    assert.match(stopped.outcome.message, /stopped before a completion brief/);
    assert.equal(launchedWork, 0);
  } finally {
    await bridge.close();
  }
});

test("retries the same failed role and turn without changing its prompt or duplicating messages", async () => {
  const prompts = [];
  let turnAttempts = 0;
  const agentRunner = {
    async run({ role, purpose, prompt }) {
      if (purpose === "synthesis") {
        return '{"decision":"Recovered","rationale":"The retry succeeded.","actions":[],"openQuestions":[],"consensus":true}';
      }
      prompts.push(prompt);
      if (role === "codex" && turnAttempts++ === 0) {
        throw new Error("529 Overloaded");
      }
      return `${role} recovered reply`;
    },
    stop: async () => {},
  };
  const bridge = await startTestBridge(agentRunner);

  try {
    const createResponse = await fetch(`${bridge.baseUrl}/sessions`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        projectPath: "/test/project",
        topic: "Recover a failed turn",
        rounds: 1,
      }),
    });
    const { id } = await createResponse.json();
    const failed = await waitFor(async () => {
      const response = await fetch(`${bridge.baseUrl}/sessions/${id}`, {
        headers: authHeaders(),
      });
      const snapshot = await response.json();
      return snapshot.phase === "failed" ? snapshot : null;
    });
    assert.equal(failed.messages.length, 0);
    assert.equal(failed.failedTurn.role, "codex");
    assert.equal(failed.failedTurn.turn, 0);
    assert.equal(failed.failedTurn.attempts, 1);

    const [firstRetry, competingRetry] = await Promise.all([
      fetch(`${bridge.baseUrl}/sessions/${id}/retry`, {
        method: "POST",
        headers: authHeaders(),
      }),
      fetch(`${bridge.baseUrl}/sessions/${id}/retry`, {
        method: "POST",
        headers: authHeaders(),
      }),
    ]);
    assert.deepEqual(
      [firstRetry.status, competingRetry.status].sort(),
      [202, 409],
    );

    const completed = await waitFor(async () => {
      const response = await fetch(`${bridge.baseUrl}/sessions/${id}`, {
        headers: authHeaders(),
      });
      const snapshot = await response.json();
      return snapshot.phase === "complete" ? snapshot : null;
    });
    assert.equal(prompts[0], prompts[1]);
    assert.deepEqual(
      completed.messages.map((message) => message.role),
      ["codex", "claude"],
    );
    assert.equal(completed.failedTurn, null);
    assert.equal(completed.outcome.status, "available");
  } finally {
    await bridge.close();
  }
});

test("stops cleanly from a failed turn without adding a synthetic error message", async () => {
  const agentRunner = {
    run: async () => {
      throw new Error("temporary provider failure");
    },
    stop: async () => {},
  };
  const bridge = await startTestBridge(agentRunner);

  try {
    const createResponse = await fetch(`${bridge.baseUrl}/sessions`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        projectPath: "/test/project",
        topic: "End a failed discussion",
        rounds: 1,
      }),
    });
    const { id } = await createResponse.json();
    await waitFor(() => bridge.sessions.get(id)?.phase === "failed");

    const stopResponse = await fetch(`${bridge.baseUrl}/sessions/${id}/stop`, {
      method: "POST",
      headers: authHeaders(),
    });
    assert.equal(stopResponse.status, 202);

    const stopped = await waitFor(async () => {
      const response = await fetch(`${bridge.baseUrl}/sessions/${id}`, {
        headers: authHeaders(),
      });
      const snapshot = await response.json();
      return snapshot.phase === "stopped" ? snapshot : null;
    });
    assert.equal(stopped.messages.length, 0);
    assert.equal(stopped.outcome.reason, "stopped");
  } finally {
    await bridge.close();
  }
});

test("expires an abandoned failed turn and releases its retained session slot", async () => {
  let calls = 0;
  const agentRunner = {
    async run({ role, purpose }) {
      if (calls++ === 0) throw new Error("temporary provider failure");
      return purpose === "synthesis"
        ? '{"decision":"Continue","rationale":"Capacity recovered.","actions":[],"openQuestions":[],"consensus":true}'
        : `${role} reply`;
    },
    stop: async () => {},
  };
  const bridge = await startTestBridge(agentRunner, {
    failedTurnTtlMs: 25,
    maxSessions: 1,
  });

  try {
    const firstResponse = await fetch(`${bridge.baseUrl}/sessions`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        projectPath: "/test/project",
        topic: "Expire this pause",
        rounds: 1,
      }),
    });
    const { id } = await firstResponse.json();
    const expired = await waitFor(async () => {
      const response = await fetch(`${bridge.baseUrl}/sessions/${id}`, {
        headers: authHeaders(),
      });
      const snapshot = await response.json();
      return snapshot.phase === "error" ? snapshot : null;
    });
    assert.match(expired.lastStatus.note, /retry window expired/i);

    const secondResponse = await fetch(`${bridge.baseUrl}/sessions`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        projectPath: "/test/project",
        topic: "Use the released slot",
        rounds: 1,
      }),
    });
    assert.equal(secondResponse.status, 201);
  } finally {
    await bridge.close();
  }
});

test("redacts failed-turn credentials before snapshots and opted-in history", async () => {
  const events = [];
  const historyStore = {
    enabled: true,
    append: async (_id, event) => events.push(event),
    list: async () => [],
    get: async () => null,
    delete: async () => false,
    clear: async () => 0,
  };
  const agentRunner = {
    run: async () => {
      throw new Error(
        "Authorization: Bearer abcdefghijklmnop token=secret-token-value sk-secretvalue123456",
      );
    },
    stop: async () => {},
  };
  const bridge = await startTestBridge(agentRunner, { historyStore });

  try {
    const createResponse = await fetch(`${bridge.baseUrl}/sessions`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        projectPath: "/test/project",
        topic: "Redact a failed turn",
        rounds: 1,
        keepHistory: true,
      }),
    });
    const { id } = await createResponse.json();
    const failed = await waitFor(async () => {
      const response = await fetch(`${bridge.baseUrl}/sessions/${id}`, {
        headers: authHeaders(),
      });
      const snapshot = await response.json();
      return snapshot.phase === "failed" ? snapshot : null;
    });
    const serialized = JSON.stringify({ failed, events });
    assert.doesNotMatch(serialized, /abcdefghijklmnop|secret-token-value|secretvalue123456/);
    assert.match(serialized, /\[redacted\]/);

    await fetch(`${bridge.baseUrl}/sessions/${id}/stop`, {
      method: "POST",
      headers: authHeaders(),
    });
  } finally {
    await bridge.close();
  }
});

test("serves a separate metadata-only archive without consuming live session capacity", async () => {
  const archivedRecords = Array.from({ length: 20 }, (_, index) => ({
    id: `archived-${String(index).padStart(8, "0")}`,
    topic: `Archived topic ${index}`,
    projectName: "project",
    projectPath: "/test/project",
    createdAt: "2026-07-29T12:00:00.000Z",
    updatedAt: "2026-07-29T12:00:00.000Z",
    status: "complete",
    totalTurns: 2,
    messageCount: 2,
    hasOutcome: true,
  }));
  const archivedSnapshot = {
    id: archivedRecords[0].id,
    phase: "complete",
    projectPath: "/test/project",
    topic: archivedRecords[0].topic,
    codexModel: "codex-test",
    claudeModel: "claude-test",
    codexEffort: "high",
    claudeEffort: "high",
    totalTurns: 2,
    completedTurns: 2,
    messages: [],
    outcome: null,
    pendingSteering: [],
    historyWarning: "",
    archived: true,
    lastStatus: {
      type: "session.status",
      status: "complete",
      turn: 2,
      totalTurns: 2,
    },
  };
  const historyStore = {
    enabled: true,
    append: async () => {},
    list: async () => archivedRecords,
    get: async (id) => (id === archivedSnapshot.id ? archivedSnapshot : null),
    delete: async () => false,
    clear: async () => archivedRecords.length,
  };
  const agentRunner = {
    run: async ({ role, purpose }) =>
      purpose === "synthesis"
        ? '{"decision":"Done","rationale":"Tested","actions":[],"openQuestions":[],"consensus":true}'
        : `${role} reply`,
    stop: async () => {},
  };
  const bridge = await startTestBridge(agentRunner, { historyStore, maxSessions: 1 });

  try {
    const historyResponse = await fetch(`${bridge.baseUrl}/history`, {
      headers: authHeaders(),
    });
    const history = await historyResponse.json();
    assert.equal(history.records.length, 20);
    assert.doesNotMatch(JSON.stringify(history.records), /reply|transcript|outcome.*decision/i);

    const archivedResponse = await fetch(
      `${bridge.baseUrl}/history/${archivedSnapshot.id}`,
      { headers: authHeaders() },
    );
    assert.equal(archivedResponse.status, 200);
    assert.equal((await archivedResponse.json()).archived, true);
    const archiveTicket = await fetch(
      `${bridge.baseUrl}/history/${archivedSnapshot.id}/ticket`,
      { method: "POST", headers: authHeaders() },
    );
    assert.equal(archiveTicket.status, 404);

    const createResponse = await fetch(`${bridge.baseUrl}/sessions`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        projectPath: "/test/project",
        topic: "A new live discussion",
        rounds: 1,
      }),
    });
    assert.equal(createResponse.status, 201);
  } finally {
    await bridge.close();
  }
});

test("history write failures do not stop the live discussion and surface a warning", async () => {
  const historyStore = {
    enabled: true,
    append: async () => {
      throw new Error("disk full");
    },
    list: async () => [],
    get: async () => null,
    delete: async () => false,
    clear: async () => 0,
  };
  const agentRunner = {
    run: async ({ role, purpose }) =>
      purpose === "synthesis"
        ? '{"decision":"Continue","rationale":"History is optional","actions":[],"openQuestions":[],"consensus":true}'
        : `${role} reply`,
    stop: async () => {},
  };
  const bridge = await startTestBridge(agentRunner, { historyStore });

  try {
    const createResponse = await fetch(`${bridge.baseUrl}/sessions`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        projectPath: "/test/project",
        topic: "Survive a history failure",
        rounds: 1,
        keepHistory: true,
      }),
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    assert.match(created.historyWarning, /History incomplete: disk full/);

    const snapshot = await waitFor(async () => {
      const response = await fetch(`${bridge.baseUrl}/sessions/${created.id}`, {
        headers: authHeaders(),
      });
      const value = await response.json();
      return value.phase === "complete" ? value : null;
    });
    assert.equal(snapshot.messages.length, 2);
    assert.equal(snapshot.outcome.status, "available");
    assert.match(snapshot.historyWarning, /disk full/);
  } finally {
    await bridge.close();
  }
});
