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

async function startTestBridge(agentRunner) {
  const { server, sessions } = createBridge({
    token,
    defaultProject: "/test/project",
    health,
    agentRunner,
    resolveProject: async () => "/test/project",
    sessionTtlMs: 5_000,
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
  const agentRunner = {
    run: async ({ role, purpose }) =>
      purpose === "synthesis"
        ? `\`\`\`json
{"decision":"Ship the brief","rationale":"It makes the transcript actionable.","actions":[{"owner":"Codex","text":"Implement it."}],"openQuestions":[],"consensus":true}
\`\`\``
        : `${role} reply`,
    stop: async () => {},
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
