import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
} from "node:fs/promises";
import { constants } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import {
  buildAgentEnvironment,
  classifyAgentAuthenticationFailure,
  withheldAuthenticationVariables,
} from "./agent-environment.mjs";
import {
  ANTIGRAVITY_REQUIRED_FLAGS,
  antigravityModelEffort,
  buildAntigravityInvocationArgs,
} from "./antigravity-invocation.mjs";
import { withAntigravityPromptFile } from "./antigravity-prompt-file.mjs";
import { runBrokerCapableParticipant } from "./broker-controller.mjs";
import { createBridge } from "./bridge-core.mjs";
import { buildClaudeInvocationArgs } from "./claude-invocation.mjs";
import { createHistoryStore } from "./history-store.mjs";
import {
  buildRoundtableUrl,
  resolveWebPort,
  roundtableWebOrigins,
} from "./launcher.mjs";
import { materializePromptAttachments } from "./prompt-attachments.mjs";
import {
  buildCodexPermissionArgs,
  buildAntigravitySandboxProfile,
  buildClaudeSandboxProfile,
  collectAncestorDirectoryEntries,
  cleanupTestSandboxes,
  cleanupTestSandboxesSync,
  createDisposableTestSandbox,
  ensureTestSandbox,
  getTestSandboxInfo,
  prepareTestSandboxes,
  removeDisposableTestSandbox,
  resolveCredentialPathAliases,
  sweepStaleTestSandboxes,
} from "./test-sandbox.mjs";
import {
  buildBrokerNetworkArgs,
  classifyBrokerProcessResult,
  resolveBrokerArgv,
} from "./test-broker.mjs";
import {
  availabilityDiagnostic,
  firstProbeFailureDiagnostic,
  probeFailureDiagnostic,
  runBoundedProbe,
} from "./probe-command.mjs";

const host = "127.0.0.1";
const port = Number(process.env.ROUNDTABLE_BRIDGE_PORT || 4317);
const webPort = resolveWebPort();
const allowedOrigins = roundtableWebOrigins(webPort);
const token = process.env.ROUNDTABLE_BRIDGE_TOKEN || randomBytes(24).toString("base64url");
const homeDirectory = homedir();
const codexHome = process.env.CODEX_HOME
  ? resolve(process.env.CODEX_HOME)
  : join(homeDirectory, ".codex");
const claudeHome = process.env.CLAUDE_CONFIG_DIR
  ? resolve(process.env.CLAUDE_CONFIG_DIR)
  : join(homeDirectory, ".claude");
const antigravityHome = join(homeDirectory, ".antigravity");
const geminiHome = join(homeDirectory, ".gemini");
const [
  codexProtectedPaths,
  claudeProtectedPaths,
  antigravityProtectedPaths,
] = await Promise.all([
  resolveCredentialPathAliases([codexHome]),
  resolveCredentialPathAliases([claudeHome]),
  resolveCredentialPathAliases([antigravityHome, geminiHome]),
]);
const agentEnvironmentOverrides = {
  codex: process.env.CODEX_HOME ? { CODEX_HOME: codexHome } : {},
  claude: process.env.CLAUDE_CONFIG_DIR ? { CLAUDE_CONFIG_DIR: claudeHome } : {},
  antigravity: {},
};
const withheldCredentialVariables = withheldAuthenticationVariables();
const claudeHomeAncestorEntries = await collectAncestorDirectoryEntries(
  homeDirectory,
  claudeHome,
);

function agentEnvironment(role) {
  return buildAgentEnvironment(role, agentEnvironmentOverrides[role]);
}

async function findExecutable(name) {
  for (const directory of (process.env.PATH || "").split(delimiter)) {
    if (!directory || !isAbsolute(directory)) continue;
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

function runCliProbe(command, args, role) {
  return runBoundedProbe({
    command,
    args,
    environment: agentEnvironment(role),
  });
}

const codexPath = await findExecutable("codex");
const claudePath = await findExecutable("claude");
const antigravityPath = await findExecutable("agy");
const sandboxExecCandidate =
  process.platform === "darwin" ? await findExecutable("sandbox-exec") : "";
const sandboxExecProbe = sandboxExecCandidate
  ? await runBoundedProbe({
      command: sandboxExecCandidate,
      args: ["-p", "(version 1)(allow default)", "/usr/bin/true"],
      captureOutput: false,
    })
  : null;
const sandboxExecPath =
  sandboxExecCandidate && sandboxExecProbe?.success ? sandboxExecCandidate : "";
const codexConfigText = await readFile(
  join(codexHome, "config.toml"),
  "utf8",
).catch(() => "");
const codexConfiguredModel =
  codexConfigText.match(/^\s*model\s*=\s*["']([^"']+)["']/m)?.[1] || "";
const codexConfiguredEffort =
  codexConfigText.match(/^\s*model_reasoning_effort\s*=\s*["']([^"']+)["']/m)?.[1] || "medium";
const claudeSettingsText = await readFile(join(claudeHome, "settings.json"), "utf8").catch(
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

const [
  codexVersionResult,
  claudeVersionResult,
  antigravityVersionResult,
  codexHelpResult,
  claudeHelpResult,
  antigravityHelpResult,
  antigravityModelsResult,
  codexAuthResult,
  claudeAuthResult,
] =
  await Promise.all([
  runCliProbe(codexPath, ["--version"], "codex"),
  runCliProbe(claudePath, ["--version"], "claude"),
  runCliProbe(antigravityPath, ["--version"], "antigravity"),
  runCliProbe(codexPath, ["exec", "--help"], "codex"),
  runCliProbe(claudePath, ["--help"], "claude"),
  runCliProbe(antigravityPath, ["--help"], "antigravity"),
  runCliProbe(antigravityPath, ["models"], "antigravity"),
  runCliProbe(codexPath, ["login", "status"], "codex"),
  runCliProbe(claudePath, ["auth", "status"], "claude"),
]);
const codexVersion = codexVersionResult.output;
const claudeVersion = claudeVersionResult.output;
const antigravityVersion = antigravityVersionResult.output;
const codexHelp = codexHelpResult.output;
const claudeHelp = claudeHelpResult.output;
const antigravityHelp = antigravityHelpResult.output;
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
const CLAUDE_LIVE_AUTH_TTL_MS = 20 * 60 * 1000;
let claudeLiveAuthCheckedAt = 0;
async function runClaudeLiveAuthProbe() {
  const result = await runBoundedProbe({
    command: claudePath,
    args: buildClaudeInvocationArgs(),
    environment: agentEnvironment("claude"),
    input: "Reply exactly ROUNDTABLE_AUTH_OK and nothing else.",
    timeoutMs: 30_000,
  });
  if (result.success) claudeLiveAuthCheckedAt = Date.now();
  return result;
}
async function ensureClaudeLiveAuthFresh() {
  if (Date.now() - claudeLiveAuthCheckedAt < CLAUDE_LIVE_AUTH_TTL_MS) return;
  const result = await runClaudeLiveAuthProbe();
  if (!result.success) {
    throw new Error(
      result.output ||
        "Claude account metadata is present, but a live request could not refresh its OAuth session.",
    );
  }
}
const claudeLiveAuthResult = claudeAuthResult.success
  ? await runClaudeLiveAuthProbe()
  : { output: "", success: false, reason: "" };
const claudeLiveAuthenticated = Boolean(
  claudeAuthResult.success && claudeLiveAuthResult.success,
);
const codexCompatible = Boolean(codexPath && codexHelp.includes("--output-last-message"));
const claudeCompatible = Boolean(
  claudePath &&
    ["--safe-mode", "--strict-mcp-config", "--permission-mode", "--effort"].every((flag) =>
      claudeHelp.includes(flag),
    ),
);
const antigravityCompatible = Boolean(
  antigravityPath &&
    ANTIGRAVITY_REQUIRED_FLAGS.every((flag) =>
      antigravityHelp.includes(flag),
    ),
);
const codexGuardProbe =
  process.platform !== "darwin" || !codexCompatible
    ? { success: Boolean(codexCompatible) }
    : await runCliProbe(
        codexPath,
        [
          "sandbox",
          "-P",
          "roundtable_workspace",
          "-C",
          tmpdir(),
          ...buildCodexPermissionArgs({
            home: homeDirectory,
            projectPath: process.cwd(),
            additionalProtectedPaths: [
              ...claudeProtectedPaths,
              ...antigravityProtectedPaths,
            ],
          }),
          "/bin/sh",
          "-c",
          'if /bin/test -r "$1"; then exit 42; fi',
          "roundtable-codex-guard",
          process.cwd(),
        ],
        "codex",
      );
const codexSafeCompatible = Boolean(codexCompatible && codexGuardProbe.success);

const startupWarnings = [
  ...(sandboxExecCandidate && sandboxExecProbe?.reason
    ? [
        probeFailureDiagnostic(
          "macOS project-guard capability probe",
          sandboxExecProbe.reason,
        ),
      ]
    : []),
  ...[
    ["Codex version probe", codexPath, codexVersionResult],
    ["Claude version probe", claudePath, claudeVersionResult],
    ["Antigravity version probe", antigravityPath, antigravityVersionResult],
  ]
    .filter(([, path, result]) => path && result.reason)
    .map(([label, , result]) => probeFailureDiagnostic(label, result.reason)),
].filter(Boolean);

const health = {
  environmentPolicy: {
    mode: "role-scoped-allowlist",
    withheldAuthenticationVariables: withheldCredentialVariables,
  },
  projectWriteGuard: Boolean(sandboxExecPath),
  testSandbox: {
    codex: Boolean(codexPath),
    claude: Boolean(codexPath),
    antigravity: Boolean(antigravityPath),
    claudeReason:
      "Claude stays read-only and may request one focused command through Roundtable's separate broker.",
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
    available: Boolean(codexSafeCompatible && codexAuthResult.success),
    version: codexVersion,
    diagnostic: availabilityDiagnostic({
      label: "Codex CLI",
      path: codexPath,
      probeFailure: firstProbeFailureDiagnostic([
        ["Codex capability probe", codexHelpResult],
        ["Codex authentication probe", codexAuthResult],
        ["Codex permission-profile probe", codexGuardProbe],
      ]),
      compatible: codexSafeCompatible,
      authenticated: codexAuthResult.success,
      login: "codex login",
    }),
  },
  claude: {
    available: Boolean(claudeCompatible && claudeLiveAuthenticated),
    version: claudeVersion,
    diagnostic:
      claudeAuthResult.success && !claudeLiveAuthResult.success && !claudeLiveAuthResult.reason
        ? "Claude account metadata is present, but a live request could not refresh its OAuth session. Run `claude auth login`, then restart the bridge."
        : availabilityDiagnostic({
            label: "Claude CLI",
            path: claudePath,
            probeFailure: firstProbeFailureDiagnostic([
              ["Claude capability probe", claudeHelpResult],
              ["Claude authentication metadata probe", claudeAuthResult],
              ["Claude live authentication probe", claudeLiveAuthResult],
            ]),
            compatible: claudeCompatible,
            authenticated: claudeLiveAuthenticated,
            login: "claude auth login",
          }),
  },
  antigravity: {
    available: Boolean(antigravityCompatible && antigravityModelsResult.success),
    version: antigravityVersion,
    diagnostic: availabilityDiagnostic({
      label: "Antigravity CLI",
      path: antigravityPath,
      probeFailure: firstProbeFailureDiagnostic([
        ["Antigravity capability probe", antigravityHelpResult],
        ["Antigravity model-access probe", antigravityModelsResult],
      ]),
      compatible: antigravityCompatible,
      authenticated: antigravityModelsResult.success,
      login: "agy",
    }),
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

async function terminateSessionProcess(
  session,
  reason,
  { beforeEscalation, afterTermination } = {},
) {
  const handle = session.child;
  if (!handle) {
    await afterTermination?.();
    return;
  }
  if (!handle.reason) handle.reason = reason;
  signalProcessTree(handle, "SIGTERM");
  let graceTimer;
  await Promise.race([
    handle.closed,
    new Promise((resolve) => {
      graceTimer = setTimeout(resolve, 2_000);
      graceTimer.unref?.();
    }),
  ]);
  clearTimeout(graceTimer);
  const cleanupErrors = [];
  if (session.child === handle) {
    try {
      await beforeEscalation?.();
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (session.child === handle) signalProcessTree(handle, "SIGKILL");
  }
  await handle.closed;
  try {
    await afterTermination?.();
  } catch (error) {
    cleanupErrors.push(error);
  }
  if (cleanupErrors.length) {
    throw new AggregateError(cleanupErrors, "Roundtable session cleanup did not complete.");
  }
}

function runManagedProcess(
  session,
  role,
  command,
  args,
  input,
  workingDirectory = session.projectPath,
  {
    acceptNonZero = false,
    environment,
    environmentRole = role,
    livenessState = "process-active",
    timeoutMs = 10 * 60 * 1000,
  } = {},
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
    env: environment || agentEnvironment(environmentRole),
    stdio: ["pipe", "pipe", "pipe"],
  });
  const processStartedAt = new Date();
  const handle = {
    child,
    closed,
    reason: null,
    escalationTimer: null,
    timeoutTimer: null,
    liveness: {
      state: livenessState,
      processStartedAt: processStartedAt.toISOString(),
      lastActivityAt: processStartedAt.toISOString(),
      timeoutAt: new Date(processStartedAt.getTime() + timeoutMs).toISOString(),
    },
  };
  session.child = handle;
  session.processLiveness = handle.liveness;

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(handle.timeoutTimer);
      clearTimeout(handle.escalationTimer);
      handle.liveness.state = "process-exited";
      handle.liveness.endedAt = new Date().toISOString();
      if (session.child === handle) session.child = null;
      resolveClosed();
      callback();
    };

    handle.timeoutTimer = setTimeout(() => {
      void terminateSessionProcess(session, "timeout");
    }, timeoutMs);
    handle.timeoutTimer.unref?.();

    child.stdout.on("data", (chunk) => {
      handle.liveness.lastActivityAt = new Date().toISOString();
      stdout += chunk.toString();
      if (stdout.length > 2_000_000) stdout = stdout.slice(-2_000_000);
    });
    child.stderr.on("data", (chunk) => {
      handle.liveness.lastActivityAt = new Date().toISOString();
      stderr += chunk.toString();
      if (stderr.length > 40_000) stderr = stderr.slice(-40_000);
    });
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code) => {
      finish(() => {
        if (handle.reason) {
          const error = new Error(
            handle.reason === "timeout"
              ? `The process exceeded the ${Math.ceil(timeoutMs / 60_000)}-minute limit.`
              : "Discussion stopped.",
          );
          error.code = handle.reason === "timeout" ? "TIMEOUT" : "USER_STOP";
          reject(error);
          return;
        }
        if (acceptNonZero) {
          resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 1 });
          return;
        }
        if (code !== 0) {
          const rawError =
            stderr.trim() || stdout.trim() || `Agent process exited with code ${code}.`;
          const authenticationFailure = classifyAgentAuthenticationFailure(role, rawError);
          const error = new Error(authenticationFailure || rawError);
          if (authenticationFailure) error.code = "AUTHENTICATION_UNAVAILABLE";
          reject(error);
          return;
        }
        resolve(stdout.trim());
      });
    });
    child.stdin.end(input);
  });
}

async function prepareParticipantInvocation(session, role) {
  const workingDirectory = await ensureTestSandbox(session, role);
  await materializePromptAttachments(
    workingDirectory,
    session.attachmentPayloads,
    session.attachmentManifestId,
  );
  return workingDirectory;
}

async function runCodex(session, prompt, purpose) {
  const workingDirectory = await prepareParticipantInvocation(session, "codex");
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
        home: homeDirectory,
        additionalProtectedPaths: [
          ...claudeProtectedPaths,
          ...antigravityProtectedPaths,
        ],
      }),
    );
    if (session.codexModel) args.push("--model", session.codexModel);
    if (session.codexEffort) {
      args.push("--config", `model_reasoning_effort="${session.codexEffort}"`);
    }
    args.push("-");
    const stdout = await runManagedProcess(
      session,
      "codex",
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

async function runClaudeModel(session, prompt) {
  // A bridge can remain open longer than Claude's access token. Refresh the
  // persisted CLI session outside the project sandbox on a bounded cadence,
  // then keep the real repository review read-only inside the sandbox below.
  await ensureClaudeLiveAuthFresh();
  const workingDirectory = await prepareParticipantInvocation(session, "claude");
  const args = buildClaudeInvocationArgs({
    model: session.claudeModel,
    effort: session.claudeEffort,
  });

  if (sandboxExecPath) {
    const siblingRoots = ["codex", "antigravity"]
      .map((role) => getTestSandboxInfo(session, role)?.root || "")
      .filter(Boolean);
    const [homeEntries, claudeHomeEntries] = await Promise.all([
      readdir(homeDirectory, { withFileTypes: true })
        .then((entries) => entries.map((entry) => entry.name))
        .catch(() => []),
      readdir(claudeHome, { withFileTypes: true })
        .then((entries) => entries.map((entry) => entry.name))
        .catch(() => []),
    ]);
    const profile = buildClaudeSandboxProfile({
      home: homeDirectory,
      claudeHome,
      claudeHomeAliases: claudeProtectedPaths,
      homeEntries,
      claudeHomeEntries,
      claudeHomeAncestorEntries,
      additionalProtectedPaths: [
        ...codexProtectedPaths,
        ...antigravityProtectedPaths,
      ],
      projectPath: session.projectPath,
      siblingRoots,
    });
    return runManagedProcess(
      session,
      "claude",
      sandboxExecPath,
      ["-p", profile, claudePath, ...args],
      prompt,
      workingDirectory,
    );
  }
  return runManagedProcess(session, "claude", claudePath, args, prompt, workingDirectory);
}

async function runBrokeredCheck(session, requesterRole, argv) {
  if (!codexPath || process.platform !== "darwin") {
    return {
      result: {
        status: "blocked",
        error: "The separate local-only network test broker is unavailable on this host.",
      },
      sandboxPaths: [],
    };
  }
  let brokerSandbox;
  try {
    brokerSandbox = await createDisposableTestSandbox(
      session,
      `${requesterRole}-broker`,
    );
    const attachmentManifestId = await materializePromptAttachments(
      brokerSandbox.workspace,
      session.attachmentPayloads,
      session.attachmentManifestId,
    );
    const scratchHome = join(brokerSandbox.root, "home");
    await mkdir(scratchHome, { recursive: true });
    const siblingRoots = ["codex", "claude", "antigravity"]
      .map((role) => getTestSandboxInfo(session, role)?.root || "")
      .filter(Boolean);
    const resolvedArgv = await resolveBrokerArgv(argv, findExecutable);
    const result = await runManagedProcess(
      session,
      requesterRole,
      codexPath,
      [
        "sandbox",
        "-P",
        "roundtable_workspace",
        "-C",
        brokerSandbox.workspace,
        ...buildCodexPermissionArgs({
          home: scratchHome,
          projectPath: session.projectPath,
          siblingRoots,
          additionalProtectedPaths: [homeDirectory],
        }),
        ...buildBrokerNetworkArgs(),
        ...resolvedArgv,
      ],
      "",
      brokerSandbox.workspace,
      {
        acceptNonZero: true,
        environment: buildAgentEnvironment("broker", { HOME: scratchHome }),
        livenessState: "broker-active",
        timeoutMs: 5 * 60 * 1000,
      },
    );
    return {
      result: {
        ...result,
        status: classifyBrokerProcessResult(result),
      },
      sandboxPaths: [brokerSandbox.root, brokerSandbox.workspace, scratchHome],
      attachmentManifestId,
    };
  } catch (error) {
    if (error?.code === "USER_STOP") throw error;
    return {
      result: {
        status: "blocked",
        error: error instanceof Error ? error.message : "The test broker failed.",
      },
      sandboxPaths: brokerSandbox
        ? [brokerSandbox.root, brokerSandbox.workspace]
        : [],
    };
  } finally {
    await removeDisposableTestSandbox(brokerSandbox);
  }
}

async function runAntigravityModel(session, prompt) {
  const workingDirectory = await prepareParticipantInvocation(session, "antigravity");
  const invoke = (controlPrompt) =>
    withAntigravityPromptFile({
      workingDirectory,
      prompt: controlPrompt,
      async run(promptFile) {
        const args = buildAntigravityInvocationArgs({
          model: session.antigravityModel,
          effort: session.antigravityEffort,
          prompt: `Use the read_file tool to read and follow every instruction at this exact absolute path: ${promptFile}. Treat it as the roundtable control prompt, not as project evidence.`,
        });
        if (sandboxExecPath) {
          const siblingRoots = ["codex", "claude", "antigravity-broker"]
            .map((role) => getTestSandboxInfo(session, role)?.root || "")
            .filter(Boolean);
          const homeEntries = await readdir(homeDirectory, { withFileTypes: true })
            .then((entries) => entries.map((entry) => entry.name))
            .catch(() => []);
          const profile = buildAntigravitySandboxProfile({
            home: homeDirectory,
            homeEntries,
            writablePaths: antigravityProtectedPaths,
            additionalProtectedPaths: [
              ...codexProtectedPaths,
              ...claudeProtectedPaths,
            ],
            projectPath: session.projectPath,
            siblingRoots,
          });
          return runManagedProcess(
            session,
            "antigravity",
            sandboxExecPath,
            ["-p", profile, antigravityPath, ...args],
            "",
            workingDirectory,
          );
        }
        return runManagedProcess(
          session,
          "antigravity",
          antigravityPath,
          args,
          "",
          workingDirectory,
        );
      },
    });
  return invoke(prompt);
}

const agentRunner = {
  beginLiveness(session) {
    session.processLiveness = null;
  },
  getLiveness(session) {
    return session.processLiveness
      ? { ...session.processLiveness }
      : { state: "preparing" };
  },
  prepare(session, { onStage } = {}) {
    return prepareTestSandboxes(session, ["codex", "claude", "antigravity"], {
      onStage,
    });
  },
  run({ session, role, prompt, purpose }) {
    if (role === "codex") return runCodex(session, prompt, purpose);
    if (role === "claude") {
      return runBrokerCapableParticipant({
        session,
        role,
        prompt,
        purpose,
        invoke: (controlPrompt) => runClaudeModel(session, controlPrompt),
        execute: (argv) => runBrokeredCheck(session, role, argv),
        onBrokerStart: () => {
          const startedAt = new Date().toISOString();
          session.processLiveness = {
            state: "broker-active",
            processStartedAt: startedAt,
            lastActivityAt: startedAt,
          };
        },
        onBrokerEnd: () => {
          session.processLiveness = { state: "request-active" };
        },
        participantSandboxPaths: [getTestSandboxInfo(session, role)?.root],
      });
    }
    return runBrokerCapableParticipant({
      session,
      role,
      prompt,
      purpose,
      invoke: (controlPrompt) => runAntigravityModel(session, controlPrompt),
      execute: (argv) => runBrokeredCheck(session, role, argv),
      onBrokerStart: () => {
        const startedAt = new Date().toISOString();
        session.processLiveness = {
          state: "broker-active",
          processStartedAt: startedAt,
          lastActivityAt: startedAt,
        };
      },
      onBrokerEnd: () => {
        session.processLiveness = { state: "request-active" };
      },
      participantSandboxPaths: [getTestSandboxInfo(session, role)?.root],
    });
  },
  stop(session, reason, options) {
    return terminateSessionProcess(session, reason, options);
  },
  cleanup(session) {
    session.brokerTransactions?.clear();
    session.attachmentPayloads = [];
    return cleanupTestSandboxes(session);
  },
};

await sweepStaleTestSandboxes();
const historyStore = createHistoryStore();
await historyStore.initialize();

const { server, sessions, shutdown } = createBridge({
  token,
  defaultProject: process.cwd(),
  health,
  agentRunner,
  resolveProject,
  historyStore,
  allowedOrigins,
});

let shutdownStarted = false;
async function shutdownBridge(signal) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  const forceTimer = setTimeout(() => {
    for (const session of sessions.values()) signalProcessTree(session.child, "SIGKILL");
    for (const session of sessions.values()) cleanupTestSandboxesSync(session);
    process.exit(1);
  }, 25_000);
  forceTimer.unref();
  await shutdown(`bridge_${String(signal || "shutdown").toLowerCase()}`).catch(() => {});
  clearTimeout(forceTimer);
  process.exit(0);
}

process.once("SIGINT", () => void shutdownBridge("SIGINT"));
process.once("SIGTERM", () => void shutdownBridge("SIGTERM"));

server.listen(port, host, () => {
  console.log("");
  console.log("  ROUNDTABLE BRIDGE");
  console.log(`  Listening: http://${host}:${port}`);
  console.log(`  Bridge key: ${token}`);
  if (withheldCredentialVariables.length) {
    console.log("");
    console.log(
      `  Withheld from agent processes: ${withheldCredentialVariables.join(", ")}`,
    );
    console.log("  Roundtable uses each CLI's persisted sign-in instead.");
  }
  for (const role of ["codex", "claude", "antigravity"]) {
    if (health[role].diagnostic) console.log(`  ${health[role].diagnostic}`);
  }
  for (const warning of startupWarnings) console.log(`  ${warning}`);
  console.log("");
  console.log("  Open the app with:");
  console.log(
    `  ${buildRoundtableUrl({
      appOrigin: `${allowedOrigins[0]}/`,
      bridgeUrl: `http://${host}:${port}`,
      token,
    })}`,
  );
  console.log("");
});
