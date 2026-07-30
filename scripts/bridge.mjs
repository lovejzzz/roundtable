import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
} from "node:fs/promises";
import { constants } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import { buildAgentEnvironment } from "./agent-environment.mjs";
import {
  ANTIGRAVITY_REQUIRED_FLAGS,
  antigravityModelEffort,
  buildAntigravityInvocationArgs,
} from "./antigravity-invocation.mjs";
import { withAntigravityPromptFile } from "./antigravity-prompt-file.mjs";
import { createBridge } from "./bridge-core.mjs";
import { buildClaudeInvocationArgs } from "./claude-invocation.mjs";
import { createHistoryStore } from "./history-store.mjs";
import {
  buildCodexPermissionArgs,
  buildAntigravitySandboxProfile,
  buildClaudeSandboxProfile,
  cleanupTestSandboxes,
  ensureTestSandbox,
  getTestSandboxInfo,
  sweepStaleTestSandboxes,
} from "./test-sandbox.mjs";

const host = "127.0.0.1";
const port = Number(process.env.ROUNDTABLE_BRIDGE_PORT || 4317);
const token = process.env.ROUNDTABLE_BRIDGE_TOKEN || randomBytes(24).toString("base64url");

async function findExecutable(name) {
  for (const directory of (process.env.PATH || "").split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, name);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue through PATH.
    }
  }
  return "";
}

function runSmallCommandResult(command, args) {
  return new Promise((resolve) => {
    if (!command) return resolve({ output: "", success: false });
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", () => resolve({ output: "", success: false }));
    child.on("close", (code) => resolve({ output: output.trim(), success: code === 0 }));
  });
}

async function runSmallCommand(command, args) {
  return (await runSmallCommandResult(command, args)).output;
}

function commandSucceeds(command, args) {
  return new Promise((resolve) => {
    if (!command) return resolve(false);
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

const codexPath = await findExecutable("codex");
const claudePath = await findExecutable("claude");
const antigravityPath = await findExecutable("agy");
const sandboxExecCandidate =
  process.platform === "darwin" ? await findExecutable("sandbox-exec") : "";
const sandboxExecPath =
  sandboxExecCandidate &&
  (await commandSucceeds(sandboxExecCandidate, [
    "-p",
    "(version 1)(allow default)",
    "/usr/bin/true",
  ]))
    ? sandboxExecCandidate
    : "";
const codexConfigText = await readFile(
  join(process.env.CODEX_HOME || join(homedir(), ".codex"), "config.toml"),
  "utf8",
).catch(() => "");
const codexConfiguredModel =
  codexConfigText.match(/^\s*model\s*=\s*["']([^"']+)["']/m)?.[1] || "";
const codexConfiguredEffort =
  codexConfigText.match(/^\s*model_reasoning_effort\s*=\s*["']([^"']+)["']/m)?.[1] || "medium";
const claudeSettingsText = await readFile(join(homedir(), ".claude", "settings.json"), "utf8").catch(
  () => "",
);
let claudeConfiguredModel = process.env.ANTHROPIC_MODEL || "";
let claudeConfiguredEffort = "medium";
if (claudeSettingsText) {
  try {
    const settings = JSON.parse(claudeSettingsText);
    if (!claudeConfiguredModel) {
      claudeConfiguredModel = typeof settings.model === "string" ? settings.model : "";
    }
    claudeConfiguredEffort =
      typeof settings.effortLevel === "string" ? settings.effortLevel : "medium";
  } catch {
    // A malformed optional settings file should not prevent the bridge from starting.
  }
}

const [codexVersion, claudeVersion, antigravityVersion, codexHelp, claudeHelp, antigravityHelp, antigravityModelsResult] =
  await Promise.all([
  runSmallCommand(codexPath, ["--version"]),
  runSmallCommand(claudePath, ["--version"]),
  runSmallCommand(antigravityPath, ["--version"]),
  runSmallCommand(codexPath, ["exec", "--help"]),
  runSmallCommand(claudePath, ["--help"]),
  runSmallCommand(antigravityPath, ["--help"]),
  runSmallCommandResult(antigravityPath, ["models"]),
]);
const antigravityModels = (antigravityModelsResult.success ? antigravityModelsResult.output : "")
  .split(/\r?\n/)
  .map((line) => line.trim().replace(/^[-*]\s*/, ""))
  .filter((line) => /^[A-Za-z0-9][A-Za-z0-9._:/[\]-]*-[A-Za-z0-9._:/[\]-]+$/.test(line));
const antigravityConfiguredModel =
  process.env.ANTIGRAVITY_MODEL || antigravityModels[0] || "";
const antigravityConfiguredEffort =
  process.env.ANTIGRAVITY_EFFORT ||
  antigravityModelEffort(antigravityConfiguredModel) ||
  "medium";

const health = {
  projectWriteGuard: Boolean(sandboxExecPath),
  testSandbox: {
    codex: Boolean(codexPath),
    claude: false,
    antigravity: Boolean(antigravityPath),
    claudeReason:
      "Claude stays on Read, Glob, and Grep until checks have a separate brokered runner.",
  },
  models: {
    codex: {
      configured: codexConfiguredModel,
      effort: codexConfiguredEffort,
      efforts: ["low", "medium", "high", "xhigh", "max", "ultra"],
    },
    claude: {
      configured: claudeConfiguredModel,
      effort: claudeConfiguredEffort,
      efforts: ["low", "medium", "high", "xhigh", "max"],
    },
    antigravity: {
      configured: antigravityConfiguredModel,
      effort: antigravityConfiguredEffort,
      efforts: ["low", "medium", "high"],
      available: antigravityModels,
    },
  },
  codex: {
    available: Boolean(codexPath && codexHelp.includes("--output-last-message")),
    version: codexVersion,
  },
  claude: {
    available: Boolean(
      claudePath &&
        ["--safe-mode", "--strict-mcp-config", "--permission-mode", "--effort"].every((flag) =>
          claudeHelp.includes(flag),
        ),
    ),
    version: claudeVersion,
  },
  antigravity: {
    available: Boolean(
      antigravityPath &&
        ANTIGRAVITY_REQUIRED_FLAGS.every((flag) =>
          antigravityHelp.includes(flag),
        ),
    ),
    version: antigravityVersion,
  },
};

async function resolveProject(requestedPath) {
  if (!isAbsolute(requestedPath)) throw new Error("Project folder must be an absolute path.");
  if (/[\u0000-\u001f\u007f]/.test(requestedPath)) {
    throw new Error("Project folder contains unsupported characters.");
  }
  const projectPath = await realpath(requestedPath);
  const projectStat = await stat(projectPath);
  if (!projectStat.isDirectory()) throw new Error("Project folder is not a directory.");
  return projectPath;
}

function signalProcessTree(handle, signal) {
  if (!handle?.child?.pid) return;
  try {
    if (process.platform === "win32") handle.child.kill(signal);
    else process.kill(-handle.child.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function terminateSessionProcess(session, reason) {
  const handle = session.child;
  if (!handle) return Promise.resolve();
  if (!handle.reason) handle.reason = reason;
  signalProcessTree(handle, "SIGTERM");
  if (!handle.escalationTimer) {
    handle.escalationTimer = setTimeout(() => signalProcessTree(handle, "SIGKILL"), 2_000);
    handle.escalationTimer.unref?.();
  }
  return handle.closed;
}

function runManagedProcess(
  session,
  command,
  args,
  input,
  workingDirectory = session.projectPath,
  environment = {},
) {
  if (session.stopRequested) {
    const error = new Error("Discussion stopped.");
    error.code = "USER_STOP";
    return Promise.reject(error);
  }
  let resolveClosed;
  const closed = new Promise((resolve) => {
    resolveClosed = resolve;
  });
  const child = spawn(command, args, {
    cwd: workingDirectory,
    detached: process.platform !== "win32",
    env: buildAgentEnvironment(environment),
    stdio: ["pipe", "pipe", "pipe"],
  });
  const handle = {
    child,
    closed,
    reason: null,
    escalationTimer: null,
    timeoutTimer: null,
  };
  session.child = handle;

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(handle.timeoutTimer);
      clearTimeout(handle.escalationTimer);
      if (session.child === handle) session.child = null;
      resolveClosed();
      callback();
    };

    handle.timeoutTimer = setTimeout(() => {
      void terminateSessionProcess(session, "timeout");
    }, 10 * 60 * 1000);
    handle.timeoutTimer.unref?.();

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 2_000_000) stdout = stdout.slice(-2_000_000);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 40_000) stderr = stderr.slice(-40_000);
    });
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code) => {
      finish(() => {
        if (handle.reason) {
          const error = new Error(
            handle.reason === "timeout" ? "The agent turn exceeded the 10-minute limit." : "Discussion stopped.",
          );
          error.code = handle.reason === "timeout" ? "TIMEOUT" : "USER_STOP";
          reject(error);
          return;
        }
        if (code !== 0) {
          reject(new Error(stderr.trim() || stdout.trim() || `Agent process exited with code ${code}.`));
          return;
        }
        resolve(stdout.trim());
      });
    });
    child.stdin.end(input);
  });
}

async function runCodex(session, prompt, purpose) {
  const workingDirectory = await ensureTestSandbox(session, "codex");
  const outputDirectory = await mkdtemp(join(tmpdir(), "roundtable-agent-reply-"));
  const outputFile = join(outputDirectory, "last-message.txt");
  try {
    const args = [
      "exec",
      "--color",
      "never",
      "--skip-git-repo-check",
      "--ephemeral",
      "--cd",
      workingDirectory,
      "--output-last-message",
      outputFile,
    ];
    const siblingRoots = ["claude", "antigravity"]
      .map((role) => getTestSandboxInfo(session, role)?.root || "")
      .filter(Boolean);
    args.push(
      ...buildCodexPermissionArgs({
        readOnly: Boolean(purpose),
        siblingRoots,
        projectPath: session.projectPath,
      }),
    );
    if (session.codexModel) args.push("--model", session.codexModel);
    if (session.codexEffort) {
      args.push("--config", `model_reasoning_effort="${session.codexEffort}"`);
    }
    args.push("-");
    const stdout = await runManagedProcess(
      session,
      codexPath,
      args,
      prompt,
      workingDirectory,
    );
    return await readFile(outputFile, "utf8").catch(() => stdout);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
}

async function runClaude(session, prompt) {
  const workingDirectory = await ensureTestSandbox(session, "claude");
  const args = buildClaudeInvocationArgs({
    model: session.claudeModel,
    effort: session.claudeEffort,
  });

  if (sandboxExecPath) {
    const siblingRoots = ["codex", "antigravity"]
      .map((role) => getTestSandboxInfo(session, role)?.root || "")
      .filter(Boolean);
    const [homeEntries, claudeHomeEntries] = await Promise.all([
      readdir(homedir(), { withFileTypes: true })
        .then((entries) => entries.map((entry) => entry.name))
        .catch(() => []),
      readdir(join(homedir(), ".claude"), { withFileTypes: true })
        .then((entries) => entries.map((entry) => entry.name))
        .catch(() => []),
    ]);
    const profile = buildClaudeSandboxProfile({
      home: homedir(),
      homeEntries,
      claudeHomeEntries,
      projectPath: session.projectPath,
      siblingRoots,
    });
    return runManagedProcess(
      session,
      sandboxExecPath,
      ["-p", profile, claudePath, ...args],
      prompt,
      workingDirectory,
    );
  }
  return runManagedProcess(session, claudePath, args, prompt, workingDirectory);
}

async function runAntigravity(session, prompt) {
  const workingDirectory = await ensureTestSandbox(session, "antigravity");
  return withAntigravityPromptFile({
    workingDirectory,
    prompt,
    async run(promptFile) {
      const args = buildAntigravityInvocationArgs({
        model: session.antigravityModel,
        effort: session.antigravityEffort,
        prompt: `Use the read_file tool to read and follow every instruction at this exact absolute path: ${promptFile}. Treat it as the roundtable control prompt, not as project evidence.`,
      });
      if (sandboxExecPath) {
        const siblingRoots = ["codex", "claude"]
          .map((role) => getTestSandboxInfo(session, role)?.root || "")
          .filter(Boolean);
        const homeEntries = await readdir(homedir(), { withFileTypes: true })
          .then((entries) => entries.map((entry) => entry.name))
          .catch(() => []);
        const profile = buildAntigravitySandboxProfile({
          home: homedir(),
          homeEntries,
          projectPath: session.projectPath,
          siblingRoots,
        });
        return runManagedProcess(
          session,
          sandboxExecPath,
          ["-p", profile, antigravityPath, ...args],
          "",
          workingDirectory,
        );
      }
      return runManagedProcess(session, antigravityPath, args, "", workingDirectory);
    },
  });
}

const agentRunner = {
  prepare(session) {
    return Promise.all(
      ["codex", "claude", "antigravity"].map((role) => ensureTestSandbox(session, role)),
    );
  },
  run({ session, role, prompt, purpose }) {
    if (role === "codex") return runCodex(session, prompt, purpose);
    if (role === "claude") return runClaude(session, prompt);
    return runAntigravity(session, prompt);
  },
  stop(session, reason) {
    return terminateSessionProcess(session, reason);
  },
  cleanup(session) {
    return cleanupTestSandboxes(session);
  },
};

await sweepStaleTestSandboxes();
const historyStore = createHistoryStore();
await historyStore.initialize();

const { server } = createBridge({
  token,
  defaultProject: process.cwd(),
  health,
  agentRunner,
  resolveProject,
  historyStore,
});

server.listen(port, host, () => {
  console.log("");
  console.log("  ROUNDTABLE BRIDGE");
  console.log(`  Listening: http://${host}:${port}`);
  console.log(`  Bridge key: ${token}`);
  console.log("");
  console.log("  Open the app with:");
  console.log(
    `  http://localhost:3000/?bridge=${encodeURIComponent(`http://${host}:${port}`)}&token=${encodeURIComponent(token)}`,
  );
  console.log("");
});
