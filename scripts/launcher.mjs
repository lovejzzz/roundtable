import { spawnSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";

export const LAUNCHER_STARTUP_TIMEOUT_MS = 60_000;
export const LAUNCHER_SHUTDOWN_GRACE_MS = 2_000;
export const LAUNCHER_FORCE_WAIT_MS = 1_000;
export const LAUNCHER_TOPIC_MAX_CHARACTERS = 4_000;
export const DEFAULT_LAUNCH_TOPIC =
  "Review this project’s architecture and agree on the highest-leverage next steps.";

function requiredArgumentValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value.`);
  }
  return value;
}

export function parseTalkArguments(argv = [], cwd = process.cwd()) {
  const options = {
    help: false,
    start: false,
    projectPath: "",
    topic: "",
    rounds: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--help" || option === "-h") {
      options.help = true;
      continue;
    }
    if (option === "--start") {
      options.start = true;
      continue;
    }
    if (option === "--project") {
      const value = requiredArgumentValue(argv, index, option).trim();
      if (!value) throw new Error("--project requires a non-empty path.");
      options.projectPath = isAbsolute(value) ? value : resolve(cwd, value);
      index += 1;
      continue;
    }
    if (option === "--topic") {
      const value = requiredArgumentValue(argv, index, option).trim();
      if (!value) throw new Error("--topic requires non-empty text.");
      if (value.length > LAUNCHER_TOPIC_MAX_CHARACTERS) {
        throw new Error(
          `--topic must be at most ${LAUNCHER_TOPIC_MAX_CHARACTERS} characters.`,
        );
      }
      options.topic = value;
      index += 1;
      continue;
    }
    if (option === "--rounds") {
      const value = requiredArgumentValue(argv, index, option);
      const rounds = Number(value);
      if (!Number.isInteger(rounds) || rounds < 1 || rounds > 5) {
        throw new Error("--rounds must be an integer from 1 through 5.");
      }
      options.rounds = rounds;
      index += 1;
      continue;
    }
    throw new Error(`Unknown Roundtable option: ${option}`);
  }

  return options;
}

export function buildRoundtableUrl({
  appOrigin = "http://localhost:3000/",
  bridgeUrl,
  token,
  projectPath = "",
  topic = "",
  rounds = null,
  sessionId = "",
}) {
  const url = new URL(appOrigin);
  url.searchParams.set("bridge", bridgeUrl);
  url.searchParams.set("token", token);
  if (projectPath) url.searchParams.set("project", projectPath);
  if (topic) url.searchParams.set("topic", topic);
  if (rounds !== null) url.searchParams.set("rounds", String(rounds));
  if (sessionId) url.searchParams.set("session", sessionId);
  return url.toString();
}

export function buildAutostartPayload(options, health) {
  return {
    projectPath: options.projectPath || health.defaultProject,
    topic: options.topic || DEFAULT_LAUNCH_TOPIC,
    attachments: [],
    rounds: options.rounds ?? 3,
    codexModel: health.models.codex.configured,
    claudeModel: health.models.claude.configured,
    antigravityModel: health.models.antigravity.configured,
    codexEffort: health.models.codex.effort,
    claudeEffort: health.models.claude.effort,
    antigravityEffort: health.models.antigravity.effort,
    keepHistory: false,
    reviewDissent: false,
  };
}

export async function startRoundtableSession({
  bridgeUrl,
  token,
  options,
  health,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl(`${bridgeUrl}/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildAutostartPayload(options, health)),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Roundtable auto-start returned an invalid bridge response.");
  }
  if (!response.ok || !data?.id) {
    throw new Error(data?.error || "Roundtable could not auto-start the discussion.");
  }
  return data.id;
}

export function resolveBridgePort(environment = process.env) {
  const rawPort = environment.ROUNDTABLE_BRIDGE_PORT || "4317";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `ROUNDTABLE_BRIDGE_PORT must be an integer from 1 through 65535; received “${rawPort}”.`,
    );
  }
  return port;
}

export function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function abortError(signal) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new Error("Roundtable startup was cancelled.");
}

function delay(milliseconds, signal) {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    timer.unref?.();
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function fetchHealth(fetchImpl, url, token, timeoutMs, signal) {
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new Error("Bridge health request timed out.")),
    timeoutMs,
  );
  timer.unref?.();
  try {
    return await fetchImpl(`${url}/health`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function waitForBridgeHealth({
  bridgeUrl,
  token,
  port,
  timeoutMs = LAUNCHER_STARTUP_TIMEOUT_MS,
  retryMs = 200,
  requestTimeoutMs = 1_000,
  fetchImpl = fetch,
  signal,
}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (signal?.aborted) throw abortError(signal);
    const remainingMs = timeoutMs - (Date.now() - startedAt);
    let response;
    try {
      response = await fetchHealth(
        fetchImpl,
        bridgeUrl,
        token,
        Math.max(1, Math.min(requestTimeoutMs, remainingMs)),
        signal,
      );
    } catch {
      if (signal?.aborted) throw abortError(signal);
      if (Date.now() - startedAt >= timeoutMs) break;
      await delay(Math.min(retryMs, timeoutMs - (Date.now() - startedAt)), signal);
      continue;
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Port ${port} is already serving a process that rejected this launch’s bridge key. ` +
          "Stop the existing process or set ROUNDTABLE_BRIDGE_PORT to a free port.",
      );
    }
    if (!response.ok) {
      throw new Error(
        `Port ${port} responded to the bridge health check with HTTP ${response.status}. ` +
          "Stop the process using that port or choose another ROUNDTABLE_BRIDGE_PORT.",
      );
    }

    let health;
    try {
      health = await response.json();
    } catch {
      throw new Error(
        `Port ${port} returned an invalid bridge health response. ` +
          "Stop the process using that port or choose another ROUNDTABLE_BRIDGE_PORT.",
      );
    }
    if (health?.ok !== true) {
      throw new Error(
        `Port ${port} did not return Roundtable bridge health. ` +
          "Stop the process using that port or choose another ROUNDTABLE_BRIDGE_PORT.",
      );
    }
    return health;
  }

  throw new Error(
    `The Roundtable bridge did not become ready within ${Math.ceil(timeoutMs / 1_000)} seconds. ` +
      "A CLI capability or authentication probe may be waiting indefinitely.",
  );
}

export async function waitForLauncherReadiness({
  bridgeReady,
  webReady,
  failure,
  timeoutMs = LAUNCHER_STARTUP_TIMEOUT_MS,
  onReady = () => {},
}) {
  let timeout;
  try {
    await Promise.race([
      Promise.all([bridgeReady, webReady]),
      failure,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error(
                `Roundtable startup did not complete within ${Math.ceil(timeoutMs / 1_000)} seconds.`,
              ),
            ),
          timeoutMs,
        );
        timeout.unref?.();
      }),
    ]);
    onReady();
  } finally {
    clearTimeout(timeout);
  }
}

export function unexpectedChildExitError(label, code, signal, ready) {
  const stage = ready ? "after startup" : "during startup";
  const result =
    signal != null
      ? `from signal ${signal}`
      : `with exit code ${code == null ? "unknown" : code}`;
  return new Error(`${label} exited unexpectedly ${stage} ${result}.`);
}

function processHasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

export function signalStartedProcessTree(
  child,
  signal,
  {
    platform = process.platform,
    killGroup = process.kill,
    runTaskkill = (args) => spawnSync("taskkill", args, { stdio: "ignore" }),
  } = {},
) {
  if (!child?.pid || processHasExited(child)) return false;
  try {
    if (platform === "win32") {
      runTaskkill([
        "/PID",
        String(child.pid),
        "/T",
        ...(signal === "SIGKILL" ? ["/F"] : []),
      ]);
    } else {
      killGroup(-child.pid, signal);
    }
    return true;
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
    return false;
  }
}

export async function stopStartedProcesses(
  children,
  {
    graceMs = LAUNCHER_SHUTDOWN_GRACE_MS,
    forceWaitMs = LAUNCHER_FORCE_WAIT_MS,
    signalTree = signalStartedProcessTree,
  } = {},
) {
  const active = [...children].filter((child) => child?.pid && !processHasExited(child));
  const closed = new Set();
  const closePromises = active.map(
    (child) =>
      new Promise((resolve) => {
        if (processHasExited(child)) {
          closed.add(child);
          resolve();
          return;
        }
        child.once("close", () => {
          closed.add(child);
          resolve();
        });
      }),
  );

  for (const child of active) signalTree(child, "SIGTERM");
  await Promise.race([Promise.all(closePromises), delay(graceMs)]);

  const survivors = active.filter((child) => !closed.has(child));
  for (const child of survivors) signalTree(child, "SIGKILL");
  if (survivors.length) {
    await Promise.race([Promise.all(closePromises), delay(forceWaitMs)]);
  }

  return {
    forced: survivors.length,
    remaining: active.filter((child) => !closed.has(child)).length,
  };
}
