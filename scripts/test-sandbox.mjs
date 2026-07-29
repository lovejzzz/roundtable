import { constants } from "node:fs";
import { cp, mkdtemp, readdir, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";

const GENERATED_DIRECTORIES = new Set([".git", ".next", ".wrangler", "dist"]);
export const TEST_SANDBOX_PREFIX = "roundtable-agent-sandbox-";

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
  projectPath,
  siblingRoot = "",
}) {
  const lines = [
    "(version 1)",
    "(allow default)",
    `(deny file-write* (literal "${sandboxLiteral(home)}"))`,
    ...homeEntries
      .filter((name) => name && name !== ".claude")
      .map(
        (name) =>
          `(deny file-write* (subpath "${sandboxLiteral(join(home, name))}"))`,
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

export function buildSiblingDenyProfile(siblingRoot) {
  return [
    "(version 1)",
    "(allow default)",
    `(deny file-read* (subpath "${sandboxLiteral(siblingRoot)}"))`,
    `(deny file-write* (subpath "${sandboxLiteral(siblingRoot)}"))`,
  ].join("\n");
}
