import { constants } from "node:fs";
import { cp, mkdtemp, readdir, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";

const GENERATED_DIRECTORIES = new Set([".git", ".next", ".wrangler", "dist"]);
export const TEST_SANDBOX_PREFIX = "roundtable-agent-sandbox-";
export const HOST_PROTECTED_CREDENTIAL_PATHS = Object.freeze([
  ".ssh",
  ".aws",
  ".gnupg",
  ".config/gh",
  ".config/gcloud",
  ".kube",
  ".docker",
  ".azure",
  ".npmrc",
  ".netrc",
  ".git-credentials",
  ".pypirc",
]);
export const CLAUDE_WRITABLE_RUNTIME_PATHS = Object.freeze([
  "backups",
  "cache",
  "debug",
  "session-env",
  "sessions",
  "shell-snapshots",
  "telemetry",
  ".last-cleanup",
  ".last-update-result.json",
  "stats-cache.json",
]);
const CLAUDE_PROTECTED_PATHS = Object.freeze([
  ...HOST_PROTECTED_CREDENTIAL_PATHS,
  ".codex",
]);
const CODEX_PROTECTED_PATHS = Object.freeze([
  ...HOST_PROTECTED_CREDENTIAL_PATHS,
  ".claude",
  ".claude.json",
]);

function shouldCopy(projectPath, sourcePath) {
  const relativePath = relative(projectPath, sourcePath);
  if (!relativePath) return true;
  const [topLevel] = relativePath.split(sep);
  return !GENERATED_DIRECTORIES.has(topLevel);
}

export async function ensureTestSandbox(
  session,
  role,
  {
    temporaryDirectory = tmpdir(),
    copy = cp,
    copyTimeoutMs = 2 * 60 * 1000,
    clock = Date.now,
  } = {},
) {
  session.testSandboxes ||= new Map();
  const existing = session.testSandboxes.get(role);
  if (existing) return existing.workspace;

  const createdRoot = await mkdtemp(
    join(temporaryDirectory, `${TEST_SANDBOX_PREFIX}${role}-`),
  );
  const root = await realpath(createdRoot);
  const workspace = join(root, "workspace");
  const startedAt = clock();
  try {
    await copy(session.projectPath, workspace, {
      recursive: true,
      preserveTimestamps: true,
      mode: constants.COPYFILE_FICLONE,
      filter: (sourcePath) => {
        if (session.stopRequested) {
          const error = new Error("Discussion stopped while preparing the test sandbox.");
          error.code = "USER_STOP";
          throw error;
        }
        if (clock() - startedAt > copyTimeoutMs) {
          const error = new Error("Preparing the disposable test sandbox exceeded the 2-minute limit.");
          error.code = "TIMEOUT";
          throw error;
        }
        return shouldCopy(session.projectPath, sourcePath);
      },
    });
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
  session.testSandboxes.set(role, { root, workspace });
  return workspace;
}

export function getTestSandboxInfo(session, role) {
  return session.testSandboxes?.get(role) || null;
}

export async function cleanupTestSandboxes(session) {
  const sandboxes = [...(session.testSandboxes?.values() || [])];
  session.testSandboxes?.clear();
  await Promise.all(
    sandboxes.map(({ root }) => rm(root, { recursive: true, force: true })),
  );
}

export async function sweepStaleTestSandboxes({
  temporaryDirectory = tmpdir(),
  maxAgeMs = 24 * 60 * 60 * 1000,
  clock = Date.now,
} = {}) {
  const entries = await readdir(temporaryDirectory, { withFileTypes: true }).catch(() => []);
  const cutoff = clock() - maxAgeMs;
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(TEST_SANDBOX_PREFIX))
      .map(async (entry) => {
        const root = join(temporaryDirectory, entry.name);
        const metadata = await stat(root).catch(() => null);
        if (metadata && metadata.mtimeMs < cutoff) {
          await rm(root, { recursive: true, force: true });
        }
      }),
  );
}

function sandboxLiteral(value) {
  return String(value || "")
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"');
}

export function buildClaudeSandboxProfile({
  home,
  homeEntries = [],
  claudeHomeEntries = [],
  projectPath,
  siblingRoot = "",
}) {
  const claudeHome = join(home, ".claude");
  const writableRuntimePaths = new Set(CLAUDE_WRITABLE_RUNTIME_PATHS);
  const lines = [
    "(version 1)",
    "(allow default)",
    `(deny file-write* (literal "${sandboxLiteral(home)}"))`,
    `(deny file-write* (literal "${sandboxLiteral(claudeHome)}"))`,
    ...CLAUDE_PROTECTED_PATHS.map(
      (name) => `(deny file-read* (subpath "${sandboxLiteral(join(home, name))}"))`,
    ),
    ...homeEntries
      .filter((name) => name && name !== ".claude")
      .map(
        (name) =>
          `(deny file-write* (subpath "${sandboxLiteral(join(home, name))}"))`,
      ),
    ...claudeHomeEntries
      .filter((name) => name && !writableRuntimePaths.has(name))
      .map(
        (name) =>
          `(deny file-write* (subpath "${sandboxLiteral(join(claudeHome, name))}"))`,
      ),
    `(deny file-write* (subpath "${sandboxLiteral(projectPath)}"))`,
  ];
  if (siblingRoot) {
    lines.push(
      `(deny file-read* (subpath "${sandboxLiteral(siblingRoot)}"))`,
      `(deny file-write* (subpath "${sandboxLiteral(siblingRoot)}"))`,
    );
  }
  return lines.join("\n");
}

function codexConfigString(value) {
  return JSON.stringify(String(value));
}

export function buildCodexPermissionArgs({
  readOnly = false,
  siblingRoot = "",
} = {}) {
  const profileName = readOnly
    ? "roundtable_read_only"
    : "roundtable_workspace";
  const deniedPaths = [
    ...CODEX_PROTECTED_PATHS.map((name) => `~/${name}`),
    ...(siblingRoot ? [siblingRoot] : []),
  ];
  const filesystemTable = deniedPaths
    .map((path) => `${codexConfigString(path)}="deny"`)
    .join(",");
  return [
    "--config",
    `default_permissions=${codexConfigString(profileName)}`,
    "--config",
    `permissions.${profileName}.description=${codexConfigString("Roundtable disposable project access with host credential reads denied.")}`,
    "--config",
    `permissions.${profileName}.extends=${codexConfigString(readOnly ? ":read-only" : ":workspace")}`,
    "--config",
    `permissions.${profileName}.filesystem={${filesystemTable}}`,
  ];
}
