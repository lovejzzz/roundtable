import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRoundtableUrl,
  buildWebDevArgs,
  createDeferred,
  LAUNCHER_SHUTDOWN_GRACE_MS,
  parseTalkArguments,
  loadLaunchAttachments,
  resolveBridgePort,
  resolveLauncherStartupTimeout,
  resolveWebPort,
  preregisterRoundtableReview,
  startRoundtableSession,
  stopStartedProcesses,
  unexpectedChildExitError,
  waitForBridgeHealth,
  waitForLauncherReadiness,
  waitForWebHealth,
} from "./launcher.mjs";

const roundtableRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let launchOptions;
try {
  launchOptions = parseTalkArguments(process.argv.slice(2), process.cwd());
} catch (error) {
  console.error(
    `Roundtable: ${error instanceof Error ? error.message : "Invalid launch options."}`,
  );
  process.exit(1);
}

if (launchOptions.help) {
  console.log(`Usage: npm run talk -- [options]

Options:
  --project <path>  Prefill the project folder (relative paths use the caller's directory)
  --topic <text>    Prefill the discussion goal
  --rounds <1-20>   Prefill the number of rounds
  --preregister-output <path>
                    Write a no-replace bridge/config record before creating the room
  --preregister-only
                    Write the signed bridge/config record and exit before room creation
  --attachment <path>
                    Attach a local evidence file (repeatable, at most five)
  --start           Start immediately with the configured CLI defaults
  --help            Show this help`);
  process.exit(0);
}

// Attachment validation is a launch precondition. Resolve and hash every file
// before opening ports or starting child processes so duplicate basenames,
// unsafe file types, or size failures cannot leave an orphaned bridge/web app.
try {
  launchOptions.attachments = await loadLaunchAttachments(
    launchOptions.attachmentPaths,
  );
} catch (error) {
  console.error(
    `Roundtable: ${error instanceof Error ? error.message : "Attachment preflight failed."}`,
  );
  process.exit(1);
}

const token = randomBytes(24).toString("base64url");
const bridgePort = resolveBridgePort();
const webPort = resolveWebPort();
const startupTimeoutMs = resolveLauncherStartupTimeout();
const bridgeUrl = `http://127.0.0.1:${bridgePort}`;
const children = new Set();
const startupFailure = createDeferred();
const startupController = new AbortController();
const componentState = {
  bridge: { process: "starting", readiness: "pending" },
  web: { process: "starting", readiness: "pending", port: "unbound" },
};
let ready = false;
let shuttingDown = false;

function start(label, command, args, environment = {}, state = null) {
  const child = spawn(command, args, {
    cwd: roundtableRoot,
    env: { ...process.env, ...environment },
    stdio: ["inherit", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  if (state) state.process = child.pid ? "alive" : "starting";
  children.add(child);
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  child.on("error", (error) => {
    if (state) state.process = "exited";
    if (shuttingDown) return;
    const failure = new Error(`${label} could not start: ${error.message}`);
    if (ready) void shutdown(1, failure.message);
    else startupFailure.reject(failure);
  });
  child.on("close", (code, signal) => {
    if (state) state.process = "exited";
    children.delete(child);
    if (shuttingDown) return;
    const failure = unexpectedChildExitError(label, code, signal, ready);
    if (ready) void shutdown(1, failure.message);
    else startupFailure.reject(failure);
  });
  return child;
}

async function shutdown(code = 0, diagnostic = "") {
  if (shuttingDown) return;
  shuttingDown = true;
  startupController.abort(new Error("Roundtable launcher is shutting down."));
  if (diagnostic) console.error(`\n  Roundtable: ${diagnostic}\n`);
  const result = await stopStartedProcesses(children, {
    graceMs: LAUNCHER_SHUTDOWN_GRACE_MS,
  });
  if (result.remaining) {
    console.error(
      `\n  Roundtable: ${result.remaining} started process tree(s) did not exit after SIGKILL.\n`,
    );
    code = code || 1;
  }
  process.exit(code);
}

process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));

start("Bridge", process.execPath, ["scripts/bridge.mjs"], {
  ROUNDTABLE_BRIDGE_TOKEN: token,
  ROUNDTABLE_BRIDGE_PORT: String(bridgePort),
}, componentState.bridge);

start(
  "Web app",
  "npm",
  buildWebDevArgs(webPort),
  {},
  componentState.web,
);

try {
  const bridgeReady = waitForBridgeHealth({
    bridgeUrl,
    token,
    port: bridgePort,
    timeoutMs: startupTimeoutMs,
    signal: startupController.signal,
  });
  const webReady = waitForWebHealth({
    webUrl: `http://localhost:${webPort}/`,
    port: webPort,
    timeoutMs: startupTimeoutMs,
    signal: startupController.signal,
  });
  await waitForLauncherReadiness({
    bridgeReady,
    webReady,
    failure: startupFailure.promise,
    timeoutMs: startupTimeoutMs,
    componentState,
    onReady: () => {
      ready = true;
    },
  });
  const health = await bridgeReady;
  if (launchOptions.start && launchOptions.preregisterOutput) {
    await preregisterRoundtableReview({
      outputPath: launchOptions.preregisterOutput,
      options: launchOptions,
      health,
    });
    console.log(
      `  Roundtable preregistration: ${launchOptions.preregisterOutput}`,
    );
  }
  if (launchOptions.preregisterOnly) {
    await shutdown(0);
  }
  const sessionId = launchOptions.start
    ? await startRoundtableSession({
        bridgeUrl,
        token,
        options: launchOptions,
        health,
      })
    : "";
  const appUrl = buildRoundtableUrl({
    appOrigin: `http://localhost:${webPort}/`,
    bridgeUrl,
    token,
    projectPath: launchOptions.projectPath,
    topic: launchOptions.topic,
    rounds: launchOptions.rounds,
    sessionId,
  });

  console.log("");
  if (sessionId) console.log(`  Roundtable session: ${sessionId}`);
  console.log(`  Roundtable: ${appUrl}`);
  console.log("");
  if (process.env.ROUNDTABLE_NO_OPEN !== "1") {
    const opener =
      process.platform === "darwin"
        ? ["open", [appUrl]]
        : process.platform === "win32"
          ? ["cmd", ["/c", "start", "", appUrl]]
          : ["xdg-open", [appUrl]];
    const openChild = spawn(opener[0], opener[1], {
      stdio: "ignore",
      detached: true,
    });
    openChild.unref();
  }
} catch (error) {
  await shutdown(1, error instanceof Error ? error.message : "Roundtable startup failed.");
}
