import { constants, rmSync } from "node:fs";
import { execFile, spawn } from "node:child_process";
import { cp, lstat, mkdtemp, readdir, readlink, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { materializeGitContext } from "./git-context.mjs";

const GENERATED_DIRECTORIES = new Set([".git", ".next", ".wrangler", "dist"]);
const SANDBOX_REMOVE_OPTIONS = Object.freeze({
  recursive: true,
  force: true,
  maxRetries: 3,
  retryDelay: 100,
});
const execFileAsync = promisify(execFile);
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
    (relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !relativePath.startsWith(sep))
  );
}

export async function resolveCredentialPathAliases(paths, resolvePath = realpath) {
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
    const pathAliases = await resolveCredentialPathAliases([current], resolvePath);
    const siblingPaths = [];
    for (const name of entries) {
      const entryPath = join(current, name);
      if (pathIsInside(entryPath, target)) continue;
      siblingPaths.push(...(await resolveCredentialPathAliases([entryPath], resolvePath)));
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
  const copiedTarget = linkTarget ? resolve(dirname(destinationPath), linkTarget) : "";
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

export function isolatedGitEnvironment(baseEnvironment = process.env) {
  const environment = { ...baseEnvironment };
  for (const name of Object.keys(environment)) {
    if (name.startsWith("GIT_")) delete environment[name];
  }
  Object.assign(environment, {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: "Roundtable Snapshot",
    GIT_AUTHOR_EMAIL: "snapshot@roundtable.invalid",
    GIT_COMMITTER_NAME: "Roundtable Snapshot",
    GIT_COMMITTER_EMAIL: "snapshot@roundtable.invalid",
  });
  return environment;
}

function safeSnapshotPath(path) {
  if (!path || isAbsolute(path)) return false;
  const parts = path.split(/[\\/]+/);
  return !parts.includes("..") && !GENERATED_DIRECTORIES.has(parts[0]) && parts[0] !== ".roundtable-context";
}

function runGitWithInput(args, input, { cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout));
        return;
      }
      reject(new Error(Buffer.concat(stderr).toString("utf8").trim() || `git exited ${code}`));
    });
    child.stdin.end(input);
  });
}

async function writeSyntheticPathIndex(paths, blobForPath, { cwd, env }) {
  const records = paths.map((path) =>
    Buffer.from(`100644 ${blobForPath(path)}\t${path}\0`, "utf8"),
  );
  await runGitWithInput(["update-index", "-z", "--index-info"], Buffer.concat(records), { cwd, env });
}

/**
 * Build a new local-only Git snapshot inside a disposable copy. No host Git
 * metadata, configuration, refs, hooks, credentials, or remotes cross the
 * boundary; the original branch/diff evidence remains in .roundtable-context.
 * This snapshot exists so ordinary repository-aware checks can use git
 * ls-files/status/diff without weakening isolation.
 */
export async function materializeSyntheticGitSnapshot(projectPath, workspace) {
  const environment = isolatedGitEnvironment();
  const remoteHead = await execFileAsync(
    "git",
    ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
    { cwd: projectPath, env: environment },
  )
    .then(({ stdout }) => stdout.trim())
    .catch(() => "");
  let baseRef = "HEAD";
  for (const candidate of [remoteHead, "origin/main", "main", "origin/master", "master"].filter(Boolean)) {
    const exists = await execFileAsync("git", ["rev-parse", "--verify", candidate], {
      cwd: projectPath,
      env: environment,
    })
      .then(() => true)
      .catch(() => false);
    if (exists) {
      baseRef = candidate;
      break;
    }
  }
  const [{ stdout: snapshotStdout }, { stdout: deletedStdout }, { stdout: changedStdout }] =
    await Promise.all([
      execFileAsync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
        cwd: projectPath,
        env: environment,
        encoding: "buffer",
        maxBuffer: 32 * 1024 * 1024,
      }),
      execFileAsync("git", ["ls-files", "--deleted", "-z"], {
        cwd: projectPath,
        env: environment,
        encoding: "buffer",
        maxBuffer: 32 * 1024 * 1024,
      }),
      execFileAsync("git", ["diff", "--name-status", "-z", "--find-renames", baseRef, "--"], {
        cwd: projectPath,
        env: environment,
        encoding: "buffer",
        maxBuffer: 32 * 1024 * 1024,
      }),
    ]);
  const deletedPaths = new Set(deletedStdout.toString("utf8").split("\0").filter(Boolean));
  const paths = snapshotStdout
    .toString("utf8")
    .split("\0")
    .filter((path) => safeSnapshotPath(path) && !deletedPaths.has(path));
  const changedPaths = new Set();
  const renamedPaths = [];
  const changedFields = changedStdout.toString("utf8").split("\0").filter(Boolean);
  for (let index = 0; index < changedFields.length; ) {
    const status = changedFields[index++];
    const firstPath = changedFields[index++];
    if (!firstPath) break;
    changedPaths.add(firstPath);
    if (/^[RC]/.test(status)) {
      const secondPath = changedFields[index++];
      if (!secondPath) break;
      changedPaths.add(secondPath);
      if (status.startsWith("R") && safeSnapshotPath(firstPath) && safeSnapshotPath(secondPath)) {
        renamedPaths.push([firstPath, secondPath]);
      }
    }
  }
  const baselineStdout = await execFileAsync(
    "git",
    ["ls-tree", "-r", "--name-only", "-z", baseRef, "--"],
    { cwd: projectPath, env: environment, encoding: "buffer", maxBuffer: 32 * 1024 * 1024 },
  )
    .then((result) => result.stdout)
    .catch(async () =>
      (
        await execFileAsync("git", ["ls-tree", "-r", "--name-only", "-z", "HEAD", "--"], {
          cwd: projectPath,
          env: environment,
          encoding: "buffer",
          maxBuffer: 32 * 1024 * 1024,
        })
      ).stdout,
    );
  const baselinePaths = baselineStdout
    .toString("utf8")
    .split("\0")
    .filter(safeSnapshotPath);
  const baselinePathSet = new Set(baselinePaths);
  for (const path of paths) {
    if (!baselinePathSet.has(path)) changedPaths.add(path);
  }

  await execFileAsync("git", ["init", "--quiet", "--initial-branch=roundtable-snapshot"], {
    cwd: workspace,
    env: environment,
  });
  try {
    const baselineBlob = (
      await runGitWithInput(["hash-object", "-w", "--stdin"], Buffer.from("B\n"), {
        cwd: workspace,
        env: environment,
      })
    )
      .toString("utf8")
      .trim();
    const changedBlob = (
      await runGitWithInput(["hash-object", "-w", "--stdin"], Buffer.from(`${"C".repeat(128)}\n`), {
        cwd: workspace,
        env: environment,
      })
    )
      .toString("utf8")
      .trim();
    const renamedBaselineBlobs = new Map();
    const renamedSnapshotBlobs = new Map();
    for (const [index, [oldPath, newPath]] of renamedPaths.entries()) {
      const renameBlob = (
        await runGitWithInput(
          ["hash-object", "-w", "--stdin"],
          Buffer.from(`roundtable-rename-${index}\n`),
          { cwd: workspace, env: environment },
        )
      )
        .toString("utf8")
        .trim();
      renamedBaselineBlobs.set(oldPath, renameBlob);
      renamedSnapshotBlobs.set(newPath, renameBlob);
    }
    await writeFile(join(workspace, ".git", "info", "exclude"), ".roundtable-context/\n");
    await writeSyntheticPathIndex(baselinePaths, (path) => renamedBaselineBlobs.get(path) || baselineBlob, {
      cwd: workspace,
      env: environment,
    });
    await execFileAsync(
      "git",
      ["commit", "--quiet", "--allow-empty", "--no-gpg-sign", "--no-verify", "-m", "Roundtable synthetic baseline"],
      { cwd: workspace, env: environment, maxBuffer: 32 * 1024 * 1024 },
    );
    await execFileAsync("git", ["update-ref", "refs/remotes/origin/main", "HEAD"], {
      cwd: workspace,
      env: environment,
    });
    await execFileAsync("git", ["read-tree", "--empty"], { cwd: workspace, env: environment });
    await writeSyntheticPathIndex(
      paths,
      (path) =>
        renamedSnapshotBlobs.get(path) || (changedPaths.has(path) ? changedBlob : baselineBlob),
      { cwd: workspace, env: environment },
    );
    await execFileAsync(
      "git",
      ["commit", "--quiet", "--allow-empty", "--no-gpg-sign", "--no-verify", "-m", "Roundtable disposable snapshot"],
      { cwd: workspace, env: environment, maxBuffer: 32 * 1024 * 1024 },
    );
    // The index is intentionally path-only, so suppress worktree content
    // comparisons against its tiny marker blobs. .roundtable-context owns
    // original diffs; this repository exists for path-aware gates, not content history.
    for (let offset = 0; offset < paths.length; offset += 200) {
      await execFileAsync("git", ["update-index", "--assume-unchanged", "--", ...paths.slice(offset, offset + 200)], {
        cwd: workspace,
        env: environment,
        maxBuffer: 32 * 1024 * 1024,
      });
    }
  } catch (error) {
    await rm(join(workspace, ".git"), { recursive: true, force: true });
    throw error;
  }
  return true;
}

export async function ensureTestSandbox(
  session,
  role,
  {
    temporaryDirectory = tmpdir(),
    copy = cp,
    copyTimeoutMs = 2 * 60 * 1000,
    clock = Date.now,
    preparedSource = null,
  } = {},
) {
  if (session.stopRequested || session.testSandboxCleanupStarted) {
    const error = new Error("Discussion stopped while preparing the test sandbox.");
    error.code = "USER_STOP";
    throw error;
  }
  session.testSandboxes ||= new Map();
  const existing = session.testSandboxes.get(role);
  if (existing) return existing.workspace;

  const sandbox = preparedSource
    ? await clonePreparedTestSandbox(session, role, preparedSource, {
        temporaryDirectory,
        copy,
        copyTimeoutMs,
        clock,
      })
    : await createDisposableTestSandbox(session, role, {
        temporaryDirectory,
        copy,
      copyTimeoutMs,
      clock,
    });
  if (session.stopRequested || session.testSandboxCleanupStarted) {
    await removeDisposableTestSandbox(sandbox);
    const error = new Error("Discussion stopped while preparing the test sandbox.");
    error.code = "USER_STOP";
    throw error;
  }
  session.testSandboxes.set(role, sandbox);
  return sandbox.workspace;
}

function enforceCopyControl(session, startedAt, copyTimeoutMs, clock) {
  if (session.stopRequested) {
    const error = new Error("Discussion stopped while preparing the test sandbox.");
    error.code = "USER_STOP";
    throw error;
  }
  if (clock() - startedAt > copyTimeoutMs) {
    const error = new Error(
      "Preparing the disposable test sandbox exceeded the 2-minute limit.",
    );
    error.code = "TIMEOUT";
    throw error;
  }
}

function trackSandboxOperation(session, operation) {
  session.testSandboxOperations ||= new Set();
  const tracked = operation.finally(() => {
    session.testSandboxOperations.delete(tracked);
  });
  session.testSandboxOperations.add(tracked);
  return tracked;
}

export function createDisposableTestSandbox(session, role, options = {}) {
  return trackSandboxOperation(
    session,
    createDisposableTestSandboxOperation(session, role, options),
  );
}

async function createDisposableTestSandboxOperation(
  session,
  role,
  {
    temporaryDirectory = tmpdir(),
    copy = cp,
    copyTimeoutMs = 2 * 60 * 1000,
    clock = Date.now,
    materializeContext = materializeGitContext,
    materializeSnapshot = materializeSyntheticGitSnapshot,
    validateSymlinks = validateCopiedSymlinks,
    resolveRoot = realpath,
  } = {},
) {
  if (!/^[a-z0-9-]+$/i.test(role)) {
    throw new Error("The sandbox role contains unsupported characters.");
  }
  if (session.stopRequested || session.testSandboxCleanupStarted) {
    const error = new Error("Discussion stopped while preparing the test sandbox.");
    error.code = "USER_STOP";
    throw error;
  }
  const createdRoot = await mkdtemp(join(temporaryDirectory, `${TEST_SANDBOX_PREFIX}${role}-`));
  session.testSandboxRoots ||= new Set();
  session.testSandboxRoots.add(createdRoot);
  if (session.stopRequested || session.testSandboxCleanupStarted) {
    await rm(createdRoot, SANDBOX_REMOVE_OPTIONS);
    session.testSandboxRoots.delete(createdRoot);
    const error = new Error("Discussion stopped while preparing the test sandbox.");
    error.code = "USER_STOP";
    throw error;
  }
  let root = createdRoot;
  try {
    root = await resolveRoot(createdRoot);
    session.testSandboxRoots.add(root);
    if (root !== createdRoot) session.testSandboxRoots.delete(createdRoot);
  } catch (error) {
    await rm(createdRoot, SANDBOX_REMOVE_OPTIONS);
    session.testSandboxRoots.delete(createdRoot);
    throw error;
  }
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
        enforceCopyControl(session, startedAt, copyTimeoutMs, clock);
        return shouldCopy(session.projectPath, workspace, sourcePath, destinationPath);
      },
    });
    await validateSymlinks(workspace);
    // Git context improves review precision but must never make the sandbox
    // unavailable when Git metadata is incomplete or a probe times out.
    await materializeContext(session.projectPath, workspace).catch(() => null);
    // The synthetic repository is derived from a path manifest, not copied
    // host metadata. If Git is absent or the selected folder is not a repo,
    // the source copy remains usable without it.
    await materializeSnapshot(session.projectPath, workspace).catch(() => null);
  } catch (error) {
    await Promise.all(
      [...new Set([createdRoot, root])].map((path) => rm(path, SANDBOX_REMOVE_OPTIONS)),
    );
    session.testSandboxRoots.delete(createdRoot);
    session.testSandboxRoots.delete(root);
    throw error;
  }
  return {
    root,
    workspace,
    ownerRoots: session.testSandboxRoots,
    rootAliases: [root],
  };
}

export function clonePreparedTestSandbox(session, role, preparedSource, options = {}) {
  return trackSandboxOperation(
    session,
    clonePreparedTestSandboxOperation(session, role, preparedSource, options),
  );
}

async function clonePreparedTestSandboxOperation(
  session,
  role,
  preparedSource,
  {
    temporaryDirectory = tmpdir(),
    copy = cp,
    copyTimeoutMs = 2 * 60 * 1000,
    clock = Date.now,
    resolveRoot = realpath,
  } = {},
) {
  if (!/^[a-z0-9-]+$/i.test(role)) {
    throw new Error("The sandbox role contains unsupported characters.");
  }
  if (!preparedSource?.workspace) {
    throw new Error("A validated preparation source is required.");
  }
  if (session.stopRequested || session.testSandboxCleanupStarted) {
    const error = new Error("Discussion stopped while preparing the test sandbox.");
    error.code = "USER_STOP";
    throw error;
  }
  const createdRoot = await mkdtemp(join(temporaryDirectory, `${TEST_SANDBOX_PREFIX}${role}-`));
  session.testSandboxRoots ||= new Set();
  session.testSandboxRoots.add(createdRoot);
  if (session.stopRequested || session.testSandboxCleanupStarted) {
    await rm(createdRoot, SANDBOX_REMOVE_OPTIONS);
    session.testSandboxRoots.delete(createdRoot);
    const error = new Error("Discussion stopped while preparing the test sandbox.");
    error.code = "USER_STOP";
    throw error;
  }
  let root = createdRoot;
  try {
    root = await resolveRoot(createdRoot);
    session.testSandboxRoots.add(root);
    if (root !== createdRoot) session.testSandboxRoots.delete(createdRoot);
  } catch (error) {
    await rm(createdRoot, SANDBOX_REMOVE_OPTIONS);
    session.testSandboxRoots.delete(createdRoot);
    throw error;
  }
  const workspace = join(root, "workspace");
  const startedAt = clock();
  try {
    await copy(preparedSource.workspace, workspace, {
      recursive: true,
      preserveTimestamps: true,
      mode: constants.COPYFILE_FICLONE,
      dereference: false,
      verbatimSymlinks: true,
      filter: () => {
        enforceCopyControl(session, startedAt, copyTimeoutMs, clock);
        return true;
      },
    });
  } catch (error) {
    await Promise.all(
      [...new Set([createdRoot, root])].map((path) => rm(path, SANDBOX_REMOVE_OPTIONS)),
    );
    session.testSandboxRoots.delete(createdRoot);
    session.testSandboxRoots.delete(root);
    throw error;
  }
  return {
    root,
    workspace,
    ownerRoots: session.testSandboxRoots,
    rootAliases: [root],
  };
}

export async function ensurePreparedTestSandboxSource(
  session,
  {
    temporaryDirectory = tmpdir(),
    copy = cp,
    copyTimeoutMs = 2 * 60 * 1000,
    clock = Date.now,
    materializeContext = materializeGitContext,
    materializeSnapshot = materializeSyntheticGitSnapshot,
    validateSymlinks = validateCopiedSymlinks,
    onStage = () => {},
  } = {},
) {
  if (session.testSandboxSource) return session.testSandboxSource;
  if (!session.testSandboxSourcePromise) {
    onStage({ stage: "validating-source" });
    session.testSandboxSourcePromise = createDisposableTestSandbox(session, "source", {
      temporaryDirectory,
      copy,
      copyTimeoutMs,
      clock,
      materializeContext,
      materializeSnapshot,
      validateSymlinks,
    })
      .then(async (source) => {
        if (session.stopRequested) {
          await removeDisposableTestSandbox(source);
          const error = new Error("Discussion stopped while preparing the test sandbox.");
          error.code = "USER_STOP";
          throw error;
        }
        session.testSandboxSource = source;
        onStage({ stage: "source-ready" });
        return source;
      })
      .finally(() => {
        session.testSandboxSourcePromise = null;
      });
  }
  return session.testSandboxSourcePromise;
}

export async function prepareTestSandboxes(
  session,
  roles,
  {
    temporaryDirectory = tmpdir(),
    copy = cp,
    copyTimeoutMs = 2 * 60 * 1000,
    clock = Date.now,
    materializeContext = materializeGitContext,
    materializeSnapshot = materializeSyntheticGitSnapshot,
    validateSymlinks = validateCopiedSymlinks,
    onStage = () => {},
  } = {},
) {
  if (session.testSandboxPreparationPromise) return session.testSandboxPreparationPromise;
  const preparationPromise = (async () => {
    const source = await ensurePreparedTestSandboxSource(session, {
      temporaryDirectory,
      copy,
      copyTimeoutMs,
      clock,
      materializeContext,
      materializeSnapshot,
      validateSymlinks,
      onStage,
    });
    const results = await Promise.allSettled(
      roles.map(async (role) => {
        onStage({ stage: "cloning-role", role });
        return ensureTestSandbox(session, role, {
          temporaryDirectory,
          copy,
          copyTimeoutMs,
          clock,
          preparedSource: source,
        });
      }),
    );
    const failed = results.find((result) => result.status === "rejected");
    if (failed) throw failed.reason;
    onStage({ stage: "ready" });
    return results.map((result) => result.value);
  })();
  session.testSandboxPreparationPromise = preparationPromise;
  try {
    return await preparationPromise;
  } finally {
    if (session.testSandboxPreparationPromise === preparationPromise) {
      session.testSandboxPreparationPromise = null;
    }
  }
}

async function removeSandboxRoots(roots, removeRoot = rm) {
  const results = [];
  for (const root of new Set(roots.filter(Boolean))) {
    try {
      await removeRoot(root, SANDBOX_REMOVE_OPTIONS);
      results.push({ root, removed: true });
    } catch (error) {
      results.push({ root, removed: false, error });
    }
  }
  return results;
}

export async function removeDisposableTestSandbox(sandbox) {
  if (sandbox?.root) {
    const aliases = sandbox.rootAliases || [sandbox.root];
    const results = await removeSandboxRoots(aliases);
    for (const result of results) {
      if (result.removed) sandbox.ownerRoots?.delete(result.root);
    }
    const failures = results.filter((result) => !result.removed);
    if (failures.length) {
      throw new AggregateError(
        failures.map(({ error }) => error),
        "Roundtable could not remove a disposable sandbox.",
      );
    }
  }
}

export function getTestSandboxInfo(session, role) {
  return session.testSandboxes?.get(role) || null;
}

export async function cleanupTestSandboxes(session, { removeRoot = rm } = {}) {
  // Roots become session-owned immediately after mkdtemp. Remove the current
  // set to interrupt active copies, then await preparation ownership and sweep
  // again so a late clone cannot republish a root after cleanup.
  session.testSandboxCleanupStarted = true;
  const preparation = session.testSandboxPreparationPromise;
  const activeOperations = [...(session.testSandboxOperations || [])];
  const firstSweep = await removeSandboxRoots(
    [...(session.testSandboxRoots || [])],
    removeRoot,
  );
  await Promise.allSettled([preparation, ...activeOperations].filter(Boolean));
  const sandboxes = [...(session.testSandboxes?.values() || [])];
  const source = session.testSandboxSource;
  const ownedRoots = [...(session.testSandboxRoots || [])];
  session.testSandboxes?.clear();
  session.testSandboxSource = null;
  const finalSweep = await removeSandboxRoots(
    [
      ...ownedRoots,
      ...[...sandboxes, source].filter(Boolean).map(({ root }) => root),
    ],
    removeRoot,
  );
  return {
    failures: [...firstSweep, ...finalSweep].filter((result) => !result.removed),
  };
}

export function cleanupTestSandboxesSync(session, { removeRootSync = rmSync } = {}) {
  session.testSandboxCleanupStarted = true;
  const roots = new Set([
    ...(session.testSandboxRoots || []),
    ...(session.testSandboxes
      ? [...session.testSandboxes.values()].map(({ root }) => root)
      : []),
    ...(session.testSandboxSource?.root ? [session.testSandboxSource.root] : []),
  ]);
  for (const root of roots) {
    if (!root) continue;
    try {
      removeRootSync(root, SANDBOX_REMOVE_OPTIONS);
      session.testSandboxRoots?.delete(root);
    } catch {
      // Continue sweeping independent roots. The emergency caller terminates
      // active writers before this final best-effort pass.
    }
  }
  session.testSandboxes?.clear();
  session.testSandboxSource = null;
}

export async function sweepStaleTestSandboxes({
  temporaryDirectory = tmpdir(),
  maxAgeMs = 24 * 60 * 60 * 1000,
  clock = Date.now,
} = {}) {
  const entries = await readdir(temporaryDirectory, {
    withFileTypes: true,
  }).catch(() => []);
  const cutoff = clock() - maxAgeMs;
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(TEST_SANDBOX_PREFIX))
      .map(async (entry) => {
        const root = join(temporaryDirectory, entry.name);
        const metadata = await stat(root).catch(() => null);
        if (metadata && metadata.mtimeMs < cutoff) {
          await rm(root, SANDBOX_REMOVE_OPTIONS);
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
  const protectedPaths = protectedPathSet(home, CLAUDE_PROTECTED_PATHS, additionalProtectedPaths);
  const lines = [
    "(version 1)",
    "(allow default)",
    `(deny file-write* (literal "${sandboxLiteral(home)}"))`,
    ...claudeHomeAliases.map((path) => `(deny file-write* (literal "${sandboxLiteral(path)}"))`),
    ...[...protectedPaths].map((path) => `(deny file-read* (subpath "${sandboxLiteral(path)}"))`),
    ...homeEntries
      .filter((name) => name && !pathIsInside(join(home, name), claudeHome))
      .map((name) => `(deny file-write* (subpath "${sandboxLiteral(join(home, name))}"))`),
    ...claudeHomeAncestorEntries.flatMap(
      ({ path, pathAliases = [path], entries = [], siblingPaths = [] }) => [
        ...pathAliases.map((alias) => `(deny file-write* (literal "${sandboxLiteral(alias)}"))`),
        ...pathAliases.map(
          (alias) => `(deny file-write* (regex #"^${sandboxRegexLiteral(alias)}($|/)"))`,
        ),
        ...(siblingPaths.length
          ? siblingPaths
          : entries
              .filter((name) => name && !pathIsInside(join(path, name), claudeHome))
              .map((name) => join(path, name))
        ).map((siblingPath) => `(deny file-write* (subpath "${sandboxLiteral(siblingPath)}"))`),
      ],
    ),
    ...claudeHomeEntries
      .filter((name) => name && !writableRuntimePaths.has(name))
      .flatMap((name) =>
        claudeHomeAliases.map(
          (path) => `(deny file-write* (subpath "${sandboxLiteral(join(path, name))}"))`,
        ),
      ),
    ...claudeHomeAliases.flatMap((path) =>
      CLAUDE_WRITABLE_RUNTIME_PATHS.map(
        (name) => `(allow file-write* (regex #"^${sandboxRegexLiteral(join(path, name))}($|/)"))`,
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
    ...[...protectedPaths].map((path) => `(deny file-read* (subpath "${sandboxLiteral(path)}"))`),
    ...homeEntries
      .filter((name) => name && !writableRoots.has(join(home, name)))
      .map((name) => `(deny file-write* (subpath "${sandboxLiteral(join(home, name))}"))`),
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
  const profileName = readOnly ? "roundtable_read_only" : "roundtable_workspace";
  const deniedPaths = [
    ...new Set([
      ...CODEX_PROTECTED_PATHS.map((name) => (home ? join(home, name) : `~/${name}`)),
      ...additionalProtectedPaths.filter(Boolean),
      ...[siblingRoot, ...siblingRoots].filter(Boolean),
      ...(projectPath ? [projectPath] : []),
    ]),
  ];
  const filesystemTable = deniedPaths.map((path) => `${codexConfigString(path)}="deny"`).join(",");
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
