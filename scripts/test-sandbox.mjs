import { constants } from "node:fs";
import {
  cp,
  lstat,
  mkdtemp,
  readdir,
  readlink,
  realpath,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

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
  ".antigravity",
  ".gemini",
]);
const CODEX_PROTECTED_PATHS = Object.freeze([
  ...HOST_PROTECTED_CREDENTIAL_PATHS,
  ".claude",
  ".claude.json",
  ".antigravity",
  ".gemini",
]);
const ANTIGRAVITY_PROTECTED_PATHS = Object.freeze([
  ...HOST_PROTECTED_CREDENTIAL_PATHS,
  ".codex",
  ".claude",
  ".claude.json",
]);

function pathIsInside(root, candidate) {
  const relativePath = relative(root, candidate);
  return (
    !relativePath ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${sep}`) &&
      !relativePath.startsWith(sep))
  );
}

export async function resolveCredentialPathAliases(
  paths,
  resolvePath = realpath,
) {
  const aliases = [];
  for (const path of paths.filter(Boolean)) {
    aliases.push(path);
    const canonicalPath = await resolvePath(path).catch(() => "");
    if (canonicalPath) aliases.push(canonicalPath);
  }
  return [...new Set(aliases)];
}

export async function collectAncestorDirectoryEntries(
  home,
  target,
  readDirectory = readdir,
  resolvePath = realpath,
) {
  const ancestors = [];
  let current = dirname(target);
  while (current !== home && pathIsInside(home, current)) {
    const entries = await readDirectory(current, { withFileTypes: true })
      .then((values) => values.map((value) => value.name))
      .catch(() => []);
    const pathAliases = await resolveCredentialPathAliases(
      [current],
      resolvePath,
    );
    const siblingPaths = [];
    for (const name of entries) {
      const entryPath = join(current, name);
      if (pathIsInside(entryPath, target)) continue;
      siblingPaths.push(
        ...(await resolveCredentialPathAliases([entryPath], resolvePath)),
      );
    }
    ancestors.push({
      path: current,
      pathAliases,
      entries,
      siblingPaths: [...new Set(siblingPaths)],
    });
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return ancestors;
}

function unsafeSymlinkError(relativePath) {
  const error = new Error(
    `Project contains a symlink that cannot stay inside its disposable copy: ${relativePath}`,
  );
  error.code = "UNSAFE_SYMLINK";
  return error;
}

async function shouldCopy(projectPath, workspace, sourcePath, destinationPath) {
  const relativePath = relative(projectPath, sourcePath);
  if (!relativePath) return true;
  const [topLevel] = relativePath.split(sep);
  if (GENERATED_DIRECTORIES.has(topLevel)) return false;
  const metadata = await lstat(sourcePath);
  if (!metadata.isSymbolicLink()) return true;
  const [linkTarget, resolvedSourceTarget] = await Promise.all([
    readlink(sourcePath).catch(() => ""),
    realpath(sourcePath).catch(() => ""),
  ]);
  const copiedTarget = linkTarget
    ? resolve(dirname(destinationPath), linkTarget)
    : "";
  if (
    !linkTarget ||
    isAbsolute(linkTarget) ||
    !resolvedSourceTarget ||
    !pathIsInside(projectPath, resolvedSourceTarget) ||
    !pathIsInside(workspace, copiedTarget)
  ) {
    throw unsafeSymlinkError(relativePath);
  }
  return true;
}

async function validateCopiedSymlinks(workspace, directory = workspace) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      const target = await realpath(entryPath).catch(() => "");
      if (!target || !pathIsInside(workspace, target)) {
        throw unsafeSymlinkError(relative(workspace, entryPath));
      }
    } else if (entry.isDirectory()) {
      await validateCopiedSymlinks(workspace, entryPath);
    }
  }
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

  const sandbox = await createDisposableTestSandbox(session, role, {
    temporaryDirectory,
    copy,
    copyTimeoutMs,
    clock,
  });
  session.testSandboxes.set(role, sandbox);
  return sandbox.workspace;
}

export async function createDisposableTestSandbox(
  session,
  role,
  {
    temporaryDirectory = tmpdir(),
    copy = cp,
    copyTimeoutMs = 2 * 60 * 1000,
    clock = Date.now,
  } = {},
) {
  if (!/^[a-z0-9-]+$/i.test(role)) {
    throw new Error("The sandbox role contains unsupported characters.");
  }
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
      dereference: false,
      verbatimSymlinks: true,
      filter: (sourcePath, destinationPath) => {
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
        return shouldCopy(
          session.projectPath,
          workspace,
          sourcePath,
          destinationPath,
        );
      },
    });
    await validateCopiedSymlinks(workspace);
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
  return { root, workspace };
}

export async function removeDisposableTestSandbox(sandbox) {
  if (sandbox?.root) {
    await rm(sandbox.root, { recursive: true, force: true });
  }
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

function sandboxRegexLiteral(value) {
  return String(value || "")
    .replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")
    .replaceAll('"', '\\"');
}

function protectedPathSet(home, relativePaths, additionalPaths = []) {
  return new Set([
    ...relativePaths.map((name) => join(home, name)),
    ...additionalPaths.filter(Boolean),
  ]);
}

export function buildClaudeSandboxProfile({
  home,
  homeEntries = [],
  claudeHomeEntries = [],
  claudeHomeAncestorEntries = [],
  claudeHome = join(home, ".claude"),
  claudeHomeAliases = [claudeHome],
  additionalProtectedPaths = [],
  projectPath,
  siblingRoot = "",
  siblingRoots = [],
}) {
  const writableRuntimePaths = new Set(CLAUDE_WRITABLE_RUNTIME_PATHS);
  const protectedPaths = protectedPathSet(
    home,
    CLAUDE_PROTECTED_PATHS,
    additionalProtectedPaths,
  );
  const lines = [
    "(version 1)",
    "(allow default)",
    `(deny file-write* (literal "${sandboxLiteral(home)}"))`,
    ...claudeHomeAliases.map(
      (path) => `(deny file-write* (literal "${sandboxLiteral(path)}"))`,
    ),
    ...[...protectedPaths].map(
      (path) => `(deny file-read* (subpath "${sandboxLiteral(path)}"))`,
    ),
    ...homeEntries
      .filter(
        (name) =>
          name && !pathIsInside(join(home, name), claudeHome),
      )
      .map(
        (name) =>
          `(deny file-write* (subpath "${sandboxLiteral(join(home, name))}"))`,
      ),
    ...claudeHomeAncestorEntries.flatMap(
      ({ path, pathAliases = [path], entries = [], siblingPaths = [] }) => [
        ...pathAliases.map(
          (alias) =>
            `(deny file-write* (literal "${sandboxLiteral(alias)}"))`,
        ),
        ...pathAliases.map(
          (alias) =>
            `(deny file-write* (regex #"^${sandboxRegexLiteral(alias)}($|/)"))`,
        ),
        ...(siblingPaths.length
          ? siblingPaths
          : entries
              .filter(
                (name) =>
                  name && !pathIsInside(join(path, name), claudeHome),
              )
              .map((name) => join(path, name))
        ).map(
          (siblingPath) =>
            `(deny file-write* (subpath "${sandboxLiteral(siblingPath)}"))`,
        ),
      ],
    ),
    ...claudeHomeEntries
      .filter((name) => name && !writableRuntimePaths.has(name))
      .flatMap(
        (name) =>
          claudeHomeAliases.map(
            (path) =>
              `(deny file-write* (subpath "${sandboxLiteral(join(path, name))}"))`,
          ),
      ),
    ...claudeHomeAliases.flatMap((path) =>
      CLAUDE_WRITABLE_RUNTIME_PATHS.map(
        (name) =>
          `(allow file-write* (regex #"^${sandboxRegexLiteral(join(path, name))}($|/)"))`,
      ),
    ),
    `(deny file-read* (subpath "${sandboxLiteral(projectPath)}"))`,
    `(deny file-write* (subpath "${sandboxLiteral(projectPath)}"))`,
  ];
  for (const root of new Set([siblingRoot, ...siblingRoots].filter(Boolean))) {
    lines.push(
      `(deny file-read* (subpath "${sandboxLiteral(root)}"))`,
      `(deny file-write* (subpath "${sandboxLiteral(root)}"))`,
    );
  }
  return lines.join("\n");
}

export function buildAntigravitySandboxProfile({
  home,
  homeEntries = [],
  writablePaths = [join(home, ".antigravity"), join(home, ".gemini")],
  additionalProtectedPaths = [],
  projectPath,
  siblingRoots = [],
}) {
  const writableRoots = new Set(writablePaths);
  const protectedPaths = protectedPathSet(
    home,
    ANTIGRAVITY_PROTECTED_PATHS,
    additionalProtectedPaths,
  );
  const lines = [
    "(version 1)",
    "(allow default)",
    `(deny file-write* (literal "${sandboxLiteral(home)}"))`,
    ...[...protectedPaths].map(
      (path) => `(deny file-read* (subpath "${sandboxLiteral(path)}"))`,
    ),
    ...homeEntries
      .filter((name) => name && !writableRoots.has(join(home, name)))
      .map(
        (name) =>
          `(deny file-write* (subpath "${sandboxLiteral(join(home, name))}"))`,
      ),
    `(deny file-read* (subpath "${sandboxLiteral(projectPath)}"))`,
    `(deny file-write* (subpath "${sandboxLiteral(projectPath)}"))`,
  ];
  for (const root of new Set(siblingRoots.filter(Boolean))) {
    lines.push(
      `(deny file-read* (subpath "${sandboxLiteral(root)}"))`,
      `(deny file-write* (subpath "${sandboxLiteral(root)}"))`,
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
  siblingRoots = [],
  projectPath = "",
  additionalProtectedPaths = [],
  home = "",
} = {}) {
  const profileName = readOnly
    ? "roundtable_read_only"
    : "roundtable_workspace";
  const deniedPaths = [...new Set([
    ...CODEX_PROTECTED_PATHS.map((name) => (home ? join(home, name) : `~/${name}`)),
    ...additionalProtectedPaths.filter(Boolean),
    ...[siblingRoot, ...siblingRoots].filter(Boolean),
    ...(projectPath ? [projectPath] : []),
  ])];
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
