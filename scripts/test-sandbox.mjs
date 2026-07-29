import { constants } from "node:fs";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";

const GENERATED_DIRECTORIES = new Set([".git", ".next", ".wrangler", "dist"]);

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
  } = {},
) {
  session.testSandboxes ||= new Map();
  const existing = session.testSandboxes.get(role);
  if (existing) return existing.workspace;

  const root = await mkdtemp(join(temporaryDirectory, `roundtable-${role}-`));
  const workspace = join(root, "workspace");
  try {
    await copy(session.projectPath, workspace, {
      recursive: true,
      preserveTimestamps: true,
      mode: constants.COPYFILE_FICLONE,
      filter: (sourcePath) => shouldCopy(session.projectPath, sourcePath),
    });
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
  session.testSandboxes.set(role, { root, workspace });
  return workspace;
}

export async function cleanupTestSandboxes(session) {
  const sandboxes = [...(session.testSandboxes?.values() || [])];
  session.testSandboxes?.clear();
  await Promise.all(
    sandboxes.map(({ root }) => rm(root, { recursive: true, force: true })),
  );
}
