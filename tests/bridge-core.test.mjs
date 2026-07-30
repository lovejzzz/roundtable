import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOutcomeInput,
  buildDissentPrompt,
  buildTranscript,
  createBridge,
  extractDissentJson,
  extractOutcomeJson,
  extractReportedChecks,
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
    antigravity: {
      configured: "gemini-test",
      effort: "high",
      efforts: ["low", "medium", "high"],
    },
  },
  codex: { available: true, version: "codex-test" },
  claude: { available: true, version: "claude-test" },
  antigravity: { available: true, version: "antigravity-test" },
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
        rounds: 3,
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
    assert.match(prompts[0], /DISPOSABLE TEST SANDBOX/);
    assert.match(prompts[0], /You may run\s+focused existing tests/);
    assert.match(prompts[1], /READ-ONLY PROJECT COPY/);
    assert.match(prompts[1], /You cannot run shell commands or tests/);
    assert.match(prompts[1], /do not emit\s+a roundtable-checks block/);
    assert.doesNotMatch(prompts[1], /You may run\s+focused existing tests/);
    assert.match(prompts[2], /DISPOSABLE ANTIGRAVITY SANDBOX/);
    assert.match(prompts[2], /native terminal sandbox/);
    assert.match(prompts[2], /You may inspect files and optionally run focused existing/);
    assert.match(prompts[2], /Codex CLI and Claude CLI/);
    assert.match(prompts[5], /You are Antigravity CLI/);
    assert.match(prompts[8], /You are Antigravity CLI/);

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
    assert.equal(snapshot.messages.length, 3);
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
  assert.match(input.text, /\[M1\] · Codex/);
  assert.match(input.text, /\[M2\] · Claude/);
  assert.match(input.text, /\[M1\][\s\S]*excerpt shortened[\s\S]*\[M2\]/);

  const reviewPrompt = buildDissentPrompt(
    {
      topic: "Choose the next feature",
      outcome: {
        status: "available",
        decision: "A frozen decision",
        rationale: "Test it.",
        actions: [],
        openQuestions: [],
        consensus: true,
      },
      messages: [
        { author: "Codex", body: "A".repeat(2_000) },
        { author: "Claude", body: "B".repeat(2_000) },
      ],
    },
    "codex",
    input,
  );
  assert.match(reviewPrompt, /FROZEN COMPLETION BRIEF/);
  assert.match(reviewPrompt, /\[M1\][\s\S]*excerpt shortened[\s\S]*\[M2\]/);
  assert.match(reviewPrompt, /Reference only these stable labels: M1, M2/);

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

test("validates stable dissent references without contaminating synthesis input", () => {
  const parsed = extractDissentJson(
    `\`\`\`roundtable-dissent
{"version":1,"items":[{"messageLabel":"M2","position":"reject","summary":"Keep the brief unchanged.","reason":"A separate judgment is more honest."}]}
\`\`\``,
    { validLabels: ["M1", "M2"] },
  );
  assert.deepEqual(parsed, [
    {
      messageLabel: "M2",
      position: "reject",
      summary: "Keep the brief unchanged.",
      reason: "A separate judgment is more honest.",
    },
  ]);
  const redacted = extractDissentJson(
    '```roundtable-dissent\n{"version":1,"items":[{"messageLabel":"M1","position":"uncertain","summary":"token=secret-value","reason":"Bearer secret-bearer may leak"}]}\n```',
    { validLabels: ["M1"] },
  );
  assert.doesNotMatch(JSON.stringify(redacted), /secret-value|secret-bearer/);
  const input = buildOutcomeInput(
    "Test dissent coverage",
    [{ author: "Codex", round: 1, body: "A".repeat(4_000) }],
    1_400,
  );
  assert.doesNotMatch(input.text, /D1|AGENT-STATED DISSENT|Keep the brief unchanged/);
  assert.throws(
    () =>
      extractDissentJson(
        '```roundtable-dissent\n{"version":1,"items":[{"messageLabel":"M9","position":"reject","summary":"x","reason":"y"}]}\n```',
        { validLabels: ["M1"] },
      ),
    /invalid item/,
  );
});

test("isolates a malformed dissent pass and preserves the frozen brief", async () => {
  const historyStore = {
    enabled: true,
    retention: { maxRecords: 50, maxDays: 30 },
    async append() {},
    async list() {
      return [];
    },
    async get() {
      return null;
    },
    async delete() {
      return false;
    },
    async clear() {
      return 0;
    },
  };
  const agentRunner = {
    async run({ role, purpose }) {
      if (purpose === "synthesis") {
        return '{"decision":"Keep the frozen brief","rationale":"It survived.","actions":[],"openQuestions":[],"consensus":true}';
      }
      if (purpose === "dissent" && role === "codex") return "malformed";
      if (purpose === "dissent") {
        return '```roundtable-dissent\n{"version":1,"items":[]}\n```';
      }
      return `${role} reply`;
    },
    async stop() {},
  };
  const bridge = await startTestBridge(agentRunner, { historyStore });
  try {
    const response = await fetch(`${bridge.baseUrl}/sessions`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        topic: "Isolate review failure",
        rounds: 1,
        keepHistory: true,
        reviewDissent: true,
      }),
    });
    const { id } = await response.json();
    const snapshot = await waitFor(async () => {
      const value = await fetch(`${bridge.baseUrl}/sessions/${id}`, {
        headers: authHeaders(),
      }).then((result) => result.json());
      return value.phase === "complete" ? value : null;
    });
    assert.equal(snapshot.outcome.decision, "Keep the frozen brief");
    assert.equal(snapshot.dissentReviews.codex.status, "unavailable");
    assert.equal(snapshot.dissentReviews.claude.status, "completed");
    assert.equal(snapshot.dissentReviews.claude.itemCount, 0);
    assert.equal(snapshot.dissentReviews.antigravity.status, "completed");
    assert.equal(snapshot.dissentReviews.antigravity.itemCount, 0);
  } finally {
    await bridge.close();
  }
});

test("runs opt-in dissent reviews and durably accepts human judgments", async () => {
  const events = new Map();
  const synthesisPrompts = [];
  const historyStore = {
    enabled: true,
    retention: { maxRecords: 50, maxDays: 30 },
    async append(id, event) {
      events.set(id, [...(events.get(id) || []), event]);
    },
    async list() {
      return [];
    },
    async get(id) {
      const stored = events.get(id);
      if (!stored) return null;
      const creation = stored.find((event) => event.type === "session.created")?.session;
      const dissent = stored
        .filter((event) => event.type === "session.dissent")
        .flatMap((event) => event.items);
      return creation ? { ...creation, dissent } : null;
    },
    async delete() {
      return false;
    },
    async clear() {
      return 0;
    },
  };
  const agentRunner = {
    async run({ role, purpose, prompt }) {
      if (purpose === "dissent") {
        return `\`\`\`roundtable-dissent
{"version":1,"items":[{"messageLabel":"M1","position":"uncertain","summary":"${role} concern","reason":"Preserve this exact concern."}]}
\`\`\``;
      }
      if (purpose === "synthesis") {
        synthesisPrompts.push(prompt);
        return '{"decision":"Judge the experiment","rationale":"The dissent remains visible.","actions":[],"openQuestions":[],"consensus":true}';
      }
      return `${role} normal reply`;
    },
    async stop() {},
  };
  const bridge = await startTestBridge(agentRunner, { historyStore });

  try {
    const rejected = await fetch(`${bridge.baseUrl}/sessions`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        projectPath: "/test/project",
        topic: "Review dissent",
        rounds: 1,
        reviewDissent: true,
      }),
    });
    assert.equal(rejected.status, 400);
    assert.match((await rejected.json()).error, /requires local history/i);

    const response = await fetch(`${bridge.baseUrl}/sessions`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        projectPath: "/test/project",
        topic: "Review dissent",
        rounds: 1,
        reviewDissent: true,
        keepHistory: true,
      }),
    });
    assert.equal(response.status, 201);
    const { id } = await response.json();
    const snapshot = await waitFor(async () => {
      const current = await fetch(`${bridge.baseUrl}/sessions/${id}`, {
        headers: authHeaders(),
      }).then((value) => value.json());
      return current.phase === "complete" ? current : null;
    });
    assert.equal(snapshot.reviewDissent, true);
    assert.deepEqual(snapshot.dissent.map((item) => item.id), ["D1", "D2", "D3"]);
    assert.deepEqual(
      snapshot.dissent.map((item) => item.author),
      ["Codex", "Claude", "Antigravity"],
    );
    assert.equal(snapshot.dissentReviews.codex.status, "completed");
    assert.equal(snapshot.dissentReviews.claude.status, "completed");
    assert.equal(snapshot.dissentReviews.antigravity.status, "completed");
    assert.doesNotMatch(synthesisPrompts[0], /\[D1\]|codex concern|roundtable-dissent/i);

    const judgmentResponse = await fetch(`${bridge.baseUrl}/history/${id}/judgment`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ dissentId: "D1", verdict: "missed" }),
    });
    assert.equal(judgmentResponse.status, 200);
    const judged = await fetch(`${bridge.baseUrl}/sessions/${id}`, {
      headers: authHeaders(),
    }).then((value) => value.json());
    assert.equal(judged.dissentJudgments.D1.verdict, "missed");
    assert.equal(
      events.get(id).filter((event) => event.type === "dissent.judged").length,
      1,
    );
  } finally {
    await bridge.close();
  }
});

test("extracts bounded agent-reported checks without losing malformed replies", () => {
  const sandbox = "/private/tmp/roundtable-agent-sandbox-codex-example/workspace";
  const raw = `Evidence-backed recommendation.

\`\`\`roundtable-checks
{"version":1,"checks":[{"command":"npm test -- --root ${sandbox}","status":"blocked","summary":"token=super-secret-value could not listen","exitCode":1}]}
\`\`\``;
  const parsed = extractReportedChecks(raw, { sandboxPaths: [sandbox], round: 2 });
  assert.equal(parsed.body, "Evidence-backed recommendation.");
  assert.deepEqual(parsed.checks, [
    {
      command: "npm test -- --root $SANDBOX",
      status: "blocked",
      summary: "token=[redacted] could not listen",
      round: 2,
      exitCode: 1,
    },
  ]);
  const transcript = buildTranscript([
    { author: "Codex", body: parsed.body, checks: parsed.checks },
  ]);
  assert.match(transcript, /agent-reported, not bridge-verified/i);
  assert.match(transcript, /\[BLOCKED\] npm test/);

  const malformed = "Keep this whole reply.\n```roundtable-checks\n{\"version\":1}\n```";
  assert.deepEqual(extractReportedChecks(malformed), { body: malformed, checks: [] });
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
    assert.equal(snapshot.messages.length, 3);
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
    assert.equal(snapshot.messages.length, 3);
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
      return role === "codex"
        ? `codex recovered reply
\`\`\`roundtable-checks
{"version":1,"checks":[{"command":"npm test","status":"passed","summary":"Recovery check passed.","exitCode":0}]}
\`\`\``
        : `${role} recovered reply`;
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
      ["codex", "claude", "antigravity"],
    );
    assert.equal(completed.failedTurn, null);
    assert.equal(completed.outcome.status, "available");
    assert.deepEqual(completed.messages[0].checks, [
      {
        command: "npm test",
        status: "passed",
        summary: "Recovery check passed.",
        round: 1,
        exitCode: 0,
      },
    ]);
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
    assert.equal(snapshot.messages.length, 3);
    assert.equal(snapshot.outcome.status, "available");
    assert.match(snapshot.historyWarning, /disk full/);
  } finally {
    await bridge.close();
  }
});
