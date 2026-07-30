import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  createDeferred,
  resolveBridgePort,
  signalStartedProcessTree,
  stopStartedProcesses,
  unexpectedChildExitError,
  waitForBridgeHealth,
  waitForLauncherReadiness,
} from "../scripts/launcher.mjs";

test("launcher bridge port follows the configured environment", () => {
  assert.equal(resolveBridgePort({}), 4317);
  assert.equal(resolveBridgePort({ ROUNDTABLE_BRIDGE_PORT: "4400" }), 4400);
  assert.throws(
    () => resolveBridgePort({ ROUNDTABLE_BRIDGE_PORT: "not-a-port" }),
    /must be an integer/,
  );
  assert.throws(
    () => resolveBridgePort({ ROUNDTABLE_BRIDGE_PORT: "65536" }),
    /must be an integer/,
  );
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
