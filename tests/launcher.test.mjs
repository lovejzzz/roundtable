import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import {
  buildAutostartPayload,
  buildReviewPreregistration,
  buildRoundtableUrl,
  buildWebDevArgs,
  createDeferred,
  loadLaunchAttachments,
  parseTalkArguments,
  preregisterRoundtableReview,
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
import { canonicalReviewConfiguration } from "../scripts/review-configuration.mjs";

test("launcher startup patience defaults to three minutes and supports a bounded override", () => {
  assert.equal(resolveLauncherStartupTimeout({}), 180_000);
  assert.equal(
    resolveLauncherStartupTimeout({ ROUNDTABLE_STARTUP_TIMEOUT_MS: "240000" }),
    240_000,
  );
  assert.throws(
    () =>
      resolveLauncherStartupTimeout({ ROUNDTABLE_STARTUP_TIMEOUT_MS: "999" }),
    /integer from 1000 through 900000/,
  );
  assert.throws(
    () =>
      resolveLauncherStartupTimeout({
        ROUNDTABLE_STARTUP_TIMEOUT_MS: "forever",
      }),
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
        "--preregister-output",
        "../evidence/review.json",
        "--start",
      ],
      "/Users/example/current",
    ),
    {
      help: false,
      start: true,
      preregisterOnly: false,
      projectPath: "/Users/example/other-project",
      topic: "Audit release readiness",
      rounds: 2,
      preregisterOutput: "/Users/example/evidence/review.json",
      attachmentPaths: [],
    },
  );
});

test("talk launch options reject missing, unknown, and unsafe values", () => {
  assert.throws(() => parseTalkArguments(["--project"]), /requires a value/);
  assert.throws(() => parseTalkArguments(["--topic", "  "]), /non-empty text/);
  assert.throws(
    () => parseTalkArguments(["--preregister-output"]),
    /requires a value/,
  );
  assert.throws(
    () => parseTalkArguments(["--preregister-only"]),
    /requires --preregister-output/,
  );
  assert.equal(
    parseTalkArguments([
      "--preregister-output",
      "/tmp/review.json",
      "--preregister-only",
    ]).preregisterOnly,
    true,
  );
  assert.equal(parseTalkArguments(["--rounds", "6"]).rounds, 6);
  assert.deepEqual(
    parseTalkArguments([
      "--attachment",
      "../evidence/package.zip",
      "--attachment",
      "/tmp/audit.json",
    ], "/Users/example/current").attachmentPaths,
    ["/Users/example/evidence/package.zip", "/tmp/audit.json"],
  );
  assert.throws(() => parseTalkArguments(["--rounds", "21"]), /1 through 20/);
  assert.throws(
    () => parseTalkArguments(["--autostart"]),
    /Unknown Roundtable option/,
  );
});

test("CLI attachments are bounded, encoded, and media typed before preregistration", async () => {
  const root = await mkdtemp("/tmp/roundtable-launch-attachment-");
  const filePath = `${root}/evidence.json`;
  try {
    await writeFile(filePath, '{"status":"pass"}\n');
    const attachments = await loadLaunchAttachments([filePath]);
    assert.deepEqual(attachments, [
      {
        name: "evidence.json",
        mediaType: "application/json",
        contentBase64: Buffer.from('{"status":"pass"}\n').toString("base64"),
      },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
  assert.equal(
    url.searchParams.get("project"),
    "/Users/example/Project & Notes",
  );
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

test("web startup binds the selected port strictly", () => {
  assert.deepEqual(buildWebDevArgs(3010), [
    "run",
    "dev",
    "--",
    "--port",
    "3010",
    "--strictPort",
  ]);
  assert.throws(() => buildWebDevArgs(0), /valid port/);
});

test("auto-start uses the requested launch context and configured CLI defaults", async () => {
  const options = {
    help: false,
    start: true,
    preregisterOnly: false,
    projectPath: "/Users/example/EDUTOOL",
    topic: "Review product readiness",
    rounds: 3,
    preregisterOutput: "",
  };
  const health = {
    defaultProject: "/Users/example/fallback",
    models: {
      codex: { configured: "gpt-5.6-sol", effort: "high" },
      claude: { configured: "opus[1m]", effort: "high" },
      antigravity: { configured: "gemini-3.6-flash-high", effort: "high" },
    },
  };
  const payload = buildAutostartPayload(options, health);
  assert.deepEqual(payload, {
    projectPath: "/Users/example/EDUTOOL",
    topic: "Review product readiness",
    attachments: [],
    rounds: 3,
    codexModel: "gpt-5.6-sol",
    claudeModel: "opus[1m]",
    antigravityModel: "gemini-3.6-flash-high",
    fableModel: "claude-fable-5",
    codexEffort: "high",
    claudeEffort: "high",
    antigravityEffort: "high",
    fableEffort: "high",
    fableFinalAudit: true,
    keepHistory: false,
    reviewDissent: false,
    reviewConfigurationSha256: payload.reviewConfigurationSha256,
  });
  assert.match(payload.reviewConfigurationSha256, /^[a-f0-9]{64}$/);

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
  assert.deepEqual(
    JSON.parse(request.init.body),
    buildAutostartPayload(options, health),
  );
});

test("review preregistration freezes bridge identity and exact auto-start payload before room creation", async () => {
  const options = {
    help: false,
    start: true,
    preregisterOnly: false,
    projectPath: "/Users/example/EDUTOOL",
    topic: "Audit the frozen release evidence",
    rounds: 6,
    preregisterOutput: "/tmp/review.json",
    attachments: [
      {
        name: "evidence.json",
        mediaType: "application/json",
        contentBase64: Buffer.from('{"status":"pass"}\n').toString("base64"),
      },
    ],
  };
  const health = {
    defaultProject: "/Users/example/fallback",
    messageAttestation: {
      protocol: "roundtable-message-attestation-v1",
      algorithm: "Ed25519",
      publicKeySpkiBase64: "MCowBQYDK2VwAyEAexample",
      publicKeyFingerprintSha256: "a".repeat(64),
    },
    codex: { available: true },
    claude: { available: true },
    antigravity: { available: true },
    models: {
      codex: { configured: "gpt-5.6-sol", effort: "high" },
      claude: { configured: "opus[1m]", effort: "high" },
      antigravity: { configured: "gemini-3.6-flash-high", effort: "high" },
    },
  };
  const expected = buildReviewPreregistration(
    options,
    health,
    "2026-08-06T08:00:00.000Z",
  );
  let write;
  const actual = await preregisterRoundtableReview({
    outputPath: options.preregisterOutput,
    options,
    health,
    preregisteredAt: "2026-08-06T08:00:00.000Z",
    writeFileImpl: async (path, contents, fileOptions) => {
      write = { path, contents, fileOptions };
    },
  });
  assert.deepEqual(actual, expected);
  assert.equal(write.path, "/tmp/review.json");
  assert.equal(write.fileOptions.flag, "wx");
  assert.equal(write.fileOptions.mode, 0o600);
  assert.deepEqual(JSON.parse(write.contents), expected);
  assert.deepEqual(
    expected.reviewConfiguration,
    canonicalReviewConfiguration(buildAutostartPayload(options, health)),
  );
  assert.equal("contentBase64" in expected.reviewConfiguration.attachments[0], false);
  assert.match(expected.reviewConfiguration.attachments[0].sha256, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(write.contents, /eyJzdGF0dXMiOiJwYXNzIn0K/);
  assert.deepEqual(expected.participantAvailability, {
    codex: true,
    claude: true,
    antigravity: true,
    fable: true,
  });
});

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

test("launcher web port follows the configured environment", () => {
  assert.equal(resolveWebPort({}), 3000);
  assert.equal(resolveWebPort({ ROUNDTABLE_WEB_PORT: "3100" }), 3100);
  assert.throws(
    () => resolveWebPort({ ROUNDTABLE_WEB_PORT: "not-a-port" }),
    /must be an integer/,
  );
  assert.throws(
    () => resolveWebPort({ ROUNDTABLE_WEB_PORT: "65536" }),
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

test("launcher readiness attributes a living unbound web process without hiding bridge health", async () => {
  const componentState = {
    bridge: { process: "alive", readiness: "pending" },
    web: { process: "alive", readiness: "pending", port: "unknown" },
  };
  const webReady = waitForWebHealth({
    webUrl: "http://127.0.0.1:3100/",
    port: 3100,
    timeoutMs: 5,
    retryMs: 1,
    fetchImpl: async () => {
      throw new TypeError("fetch failed");
    },
  });

  await assert.rejects(
    waitForLauncherReadiness({
      bridgeReady: Promise.resolve({ ok: true }),
      webReady,
      failure: new Promise(() => {}),
      timeoutMs: 100,
      componentState,
    }),
    (error) => {
      assert.match(
        error.message,
        /bridge=ready; web process=alive; web port=unbound/,
      );
      assert.match(error.message, /synced or cloud-backed folder/i);
      return true;
    },
  );
  assert.equal(componentState.bridge.readiness, "ready");
  assert.equal(componentState.web.readiness, "failed");
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
