import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  buildAutostartPayload,
  buildRoundtableUrl,
  createDeferred,
  parseTalkArguments,
  resolveBridgePort,
  resolveLauncherStartupTimeout,
  resolveWebPort,
  roundtableWebOrigins,
  signalStartedProcessTree,
  startRoundtableSession,
  stopStartedProcesses,
  unexpectedChildExitError,
  waitForBridgeHealth,
  waitForLauncherReadiness,
  waitForWebHealth,
} from "../scripts/launcher.mjs";

test("launcher startup patience defaults to three minutes and supports a bounded override", () => {
  assert.equal(resolveLauncherStartupTimeout({}), 180_000);
  assert.equal(resolveLauncherStartupTimeout({ ROUNDTABLE_STARTUP_TIMEOUT_MS: "240000" }), 240_000);
  assert.throws(
    () => resolveLauncherStartupTimeout({ ROUNDTABLE_STARTUP_TIMEOUT_MS: "999" }),
    /integer from 1000 through 900000/,
  );
  assert.throws(
    () => resolveLauncherStartupTimeout({ ROUNDTABLE_STARTUP_TIMEOUT_MS: "forever" }),
    /integer from 1000 through 900000/,
  );
});

test("talk launch options prefill another project without changing the caller cwd", () => {
  assert.deepEqual(
    parseTalkArguments(
      [
        "--project",
        "../other-project",
        "--topic",
        "Audit release readiness",
        "--rounds",
        "2",
        "--start",
      ],
      "/Users/example/current",
    ),
    {
      help: false,
      start: true,
      projectPath: "/Users/example/other-project",
      topic: "Audit release readiness",
      rounds: 2,
    },
  );
});

test("talk launch options reject missing, unknown, and unsafe values", () => {
  assert.throws(() => parseTalkArguments(["--project"]), /requires a value/);
  assert.throws(() => parseTalkArguments(["--topic", "  "]), /non-empty text/);
  assert.throws(() => parseTalkArguments(["--rounds", "6"]), /1 through 5/);
  assert.throws(() => parseTalkArguments(["--autostart"]), /Unknown Roundtable option/);
});

test("connected room URL carries encoded launch context", () => {
  const url = new URL(
    buildRoundtableUrl({
      bridgeUrl: "http://127.0.0.1:4317",
      token: "private-token",
      projectPath: "/Users/example/Project & Notes",
      topic: "Review auth & release?",
      rounds: 2,
      sessionId: "session-123",
    }),
  );

  assert.equal(url.origin, "http://localhost:3000");
  assert.equal(url.searchParams.get("bridge"), "http://127.0.0.1:4317");
  assert.equal(url.searchParams.get("token"), "private-token");
  assert.equal(url.searchParams.get("project"), "/Users/example/Project & Notes");
  assert.equal(url.searchParams.get("topic"), "Review auth & release?");
  assert.equal(url.searchParams.get("rounds"), "2");
  assert.equal(url.searchParams.get("session"), "session-123");
});

test("alternate web ports produce matching browser origins", () => {
  assert.deepEqual(roundtableWebOrigins(3003), [
    "http://localhost:3003",
    "http://127.0.0.1:3003",
  ]);
  assert.throws(() => roundtableWebOrigins(0), /valid port/);
});

test("auto-start uses the requested launch context and configured CLI defaults", async () => {
  const options = {
    help: false,
    start: true,
    projectPath: "/Users/example/EDUTOOL",
    topic: "Review product readiness",
    rounds: 3,
  };
  const health = {
    defaultProject: "/Users/example/fallback",
    models: {
      codex: { configured: "gpt-5.6-sol", effort: "high" },
      claude: { configured: "opus[1m]", effort: "high" },
      antigravity: { configured: "gemini-3.6-flash-high", effort: "high" },
    },
  };
  assert.deepEqual(buildAutostartPayload(options, health), {
    projectPath: "/Users/example/EDUTOOL",
    topic: "Review product readiness",
    attachments: [],
    rounds: 3,
    codexModel: "gpt-5.6-sol",
    claudeModel: "opus[1m]",
    antigravityModel: "gemini-3.6-flash-high",
    codexEffort: "high",
    claudeEffort: "high",
    antigravityEffort: "high",
    keepHistory: false,
    reviewDissent: false,
  });

  let request;
  const sessionId = await startRoundtableSession({
    bridgeUrl: "http://127.0.0.1:4317",
    token: "private-token",
    options,
    health,
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({ id: "session-123" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  assert.equal(sessionId, "session-123");
  assert.equal(request.url, "http://127.0.0.1:4317/sessions");
  assert.equal(request.init.headers.Authorization, "Bearer private-token");
  assert.deepEqual(JSON.parse(request.init.body), buildAutostartPayload(options, health));
});

test("launcher bridge port follows the configured environment", () => {
  assert.equal(resolveBridgePort({}), 4317);
  assert.equal(resolveBridgePort({ ROUNDTABLE_BRIDGE_PORT: "4400" }), 4400);
  assert.throws(
    () => resolveBridgePort({ ROUNDTABLE_BRIDGE_PORT: "not-a-port" }),
    /must be an integer/,
  );
  assert.throws(() => resolveBridgePort({ ROUNDTABLE_BRIDGE_PORT: "65536" }), /must be an integer/);
});

test("launcher web port follows the configured environment", () => {
  assert.equal(resolveWebPort({}), 3000);
  assert.equal(resolveWebPort({ ROUNDTABLE_WEB_PORT: "3100" }), 3100);
  assert.throws(() => resolveWebPort({ ROUNDTABLE_WEB_PORT: "not-a-port" }), /must be an integer/);
  assert.throws(() => resolveWebPort({ ROUNDTABLE_WEB_PORT: "65536" }), /must be an integer/);
});

test("authenticated bridge health retries transient connection failures", async () => {
  let attempts = 0;
  const health = await waitForBridgeHealth({
    bridgeUrl: "http://127.0.0.1:4400",
    token: "fresh-token",
    port: 4400,
    timeoutMs: 100,
    retryMs: 1,
    fetchImpl: async (_url, options) => {
      attempts += 1;
      assert.equal(options.headers.Authorization, "Bearer fresh-token");
      if (attempts === 1) throw new TypeError("fetch failed");
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  assert.equal(attempts, 2);
  assert.deepEqual(health, { ok: true });
});

test("rejecting listener produces an actionable port-conflict error", async () => {
  await assert.rejects(
    waitForBridgeHealth({
      bridgeUrl: "http://127.0.0.1:4317",
      token: "fresh-token",
      port: 4317,
      timeoutMs: 100,
      fetchImpl: async () => new Response("Unauthorized", { status: 401 }),
    }),
    /Port 4317 is already serving a process.*ROUNDTABLE_BRIDGE_PORT/,
  );
});

test("unrelated successful listener cannot satisfy bridge readiness", async () => {
  await assert.rejects(
    waitForBridgeHealth({
      bridgeUrl: "http://127.0.0.1:4317",
      token: "fresh-token",
      port: 4317,
      timeoutMs: 100,
      fetchImpl: async () =>
        new Response(JSON.stringify({ service: "other" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    }),
    /did not return Roundtable bridge health/,
  );
});

test("web readiness polls the app instead of depending on a console banner", async () => {
  let attempts = 0;
  await waitForWebHealth({
    webUrl: "http://127.0.0.1:3100/",
    port: 3100,
    timeoutMs: 100,
    retryMs: 1,
    fetchImpl: async (url, options) => {
      attempts += 1;
      assert.equal(url, "http://127.0.0.1:3100/");
      assert.equal(options.cache, "no-store");
      if (attempts === 1) throw new TypeError("fetch failed");
      if (attempts === 2) return new Response("Starting", { status: 503 });
      return new Response("Roundtable", { status: 200 });
    },
  });

  assert.equal(attempts, 3);
});

test("web readiness reports the port when the app never becomes healthy", async () => {
  await assert.rejects(
    waitForWebHealth({
      webUrl: "http://127.0.0.1:3100/",
      port: 3100,
      timeoutMs: 5,
      retryMs: 1,
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    }),
    /web app on port 3100 did not become ready/,
  );
});

test("launcher readiness waits for both the web app and bridge", async () => {
  const bridge = createDeferred();
  const web = createDeferred();
  const failure = createDeferred();
  let readyCount = 0;
  let settled = false;
  const readiness = waitForLauncherReadiness({
    bridgeReady: bridge.promise,
    webReady: web.promise,
    failure: failure.promise,
    timeoutMs: 100,
    onReady: () => {
      readyCount += 1;
    },
  }).then(() => {
    settled = true;
  });

  web.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  assert.equal(readyCount, 0);

  bridge.resolve({ ok: true });
  await readiness;
  assert.equal(settled, true);
  assert.equal(readyCount, 1);
});

test("launcher readiness aborts on zero and signal child exits", async () => {
  for (const [code, signal, expected] of [
    [0, null, /exit code 0/],
    [null, "SIGTERM", /signal SIGTERM/],
  ]) {
    const failure = createDeferred();
    failure.reject(unexpectedChildExitError("Bridge", code, signal, false));
    await assert.rejects(
      waitForLauncherReadiness({
        bridgeReady: new Promise(() => {}),
        webReady: new Promise(() => {}),
        failure: failure.promise,
        timeoutMs: 100,
      }),
      expected,
    );
  }
});

test("launcher readiness has an overall deadline", async () => {
  await assert.rejects(
    waitForLauncherReadiness({
      bridgeReady: new Promise(() => {}),
      webReady: new Promise(() => {}),
      failure: new Promise(() => {}),
      timeoutMs: 5,
    }),
    /did not complete within 1 seconds/,
  );
});

test("POSIX process-tree signaling targets the started process group", () => {
  const calls = [];
  const child = { pid: 4321, exitCode: null, signalCode: null };
  assert.equal(
    signalStartedProcessTree(child, "SIGTERM", {
      platform: "darwin",
      killGroup: (...args) => calls.push(args),
    }),
    true,
  );
  assert.deepEqual(calls, [[-4321, "SIGTERM"]]);
});

test("shutdown escalates only still-running started process trees", async () => {
  class FakeChild extends EventEmitter {
    constructor(pid) {
      super();
      this.pid = pid;
      this.exitCode = null;
      this.signalCode = null;
    }
  }

  const graceful = new FakeChild(1001);
  const stubborn = new FakeChild(1002);
  const signals = [];
  const result = await stopStartedProcesses([graceful, stubborn], {
    graceMs: 2,
    forceWaitMs: 20,
    signalTree(child, signal) {
      signals.push([child.pid, signal]);
      if (child === graceful && signal === "SIGTERM") {
        child.signalCode = signal;
        queueMicrotask(() => child.emit("close", null, signal));
      }
      if (child === stubborn && signal === "SIGKILL") {
        child.signalCode = signal;
        queueMicrotask(() => child.emit("close", null, signal));
      }
      return true;
    },
  });

  assert.deepEqual(signals, [
    [1001, "SIGTERM"],
    [1002, "SIGTERM"],
    [1002, "SIGKILL"],
  ]);
  assert.deepEqual(result, { forced: 1, remaining: 0 });
});
