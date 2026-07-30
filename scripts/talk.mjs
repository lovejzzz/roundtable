import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  createDeferred,
  LAUNCHER_SHUTDOWN_GRACE_MS,
  resolveBridgePort,
  stopStartedProcesses,
  unexpectedChildExitError,
  waitForBridgeHealth,
  waitForLauncherReadiness,
} from "./launcher.mjs";

const token = randomBytes(24).toString("base64url");
const bridgePort = resolveBridgePort();
const bridgeUrl = `http://127.0.0.1:${bridgePort}`;
const appUrl = `http://localhost:3000/?bridge=${encodeURIComponent(bridgeUrl)}&token=${encodeURIComponent(token)}`;
const children = new Set();
const startupFailure = createDeferred();
const webReady = createDeferred();
const startupController = new AbortController();
let ready = false;
let shuttingDown = false;

function start(label, command, args, environment = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...environment },
    stdio: ["inherit", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  children.add(child);
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  child.on("error", (error) => {
    if (shuttingDown) return;
    const failure = new Error(`${label} could not start: ${error.message}`);
    if (ready) void shutdown(1, failure.message);
    else startupFailure.reject(failure);
  });
  child.on("close", (code, signal) => {
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
});

const web = start("Web app", "npm", ["run", "dev"]);
let webOutput = "";
web.stdout.on("data", (chunk) => {
  webOutput = `${webOutput}${chunk.toString()}`.slice(-2_000);
  if (webOutput.includes("Local:")) webReady.resolve();
});

try {
  await waitForLauncherReadiness({
    bridgeReady: waitForBridgeHealth({
      bridgeUrl,
      token,
      port: bridgePort,
      signal: startupController.signal,
    }),
    webReady: webReady.promise,
    failure: startupFailure.promise,
    onReady: () => {
      ready = true;
    },
  });

  console.log("");
  console.log(`  Roundtable: ${appUrl}`);
  console.log("");
  if (process.env.ROUNDTABLE_NO_OPEN !== "1") {
    const opener =
      process.platform === "darwin"
        ? ["open", [appUrl]]
        : process.platform === "win32"
          ? ["cmd", ["/c", "start", "", appUrl]]
          : ["xdg-open", [appUrl]];
    const openChild = spawn(opener[0], opener[1], { stdio: "ignore", detached: true });
    openChild.unref();
  }
} catch (error) {
  await shutdown(
    1,
    error instanceof Error ? error.message : "Roundtable startup failed.",
  );
}
