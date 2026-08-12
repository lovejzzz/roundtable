import { execFile } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const ROUNDTABLE_GIT_CONTEXT_DIRECTORY = ".roundtable-context";
const MAX_UNTRACKED_PATCH_BYTES = 2 * 1024 * 1024;
const MAX_UNTRACKED_FILE_BYTES = 512 * 1024;
const MAX_UNTRACKED_FILES = 100;

async function runGit(projectPath, args) {
  const { stdout } = await execFileAsync("git", args, {
    cwd: projectPath,
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 32 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
    },
  });
  return stdout.trimEnd();
}

async function runGitDiff(projectPath, args) {
  try {
    return await runGit(projectPath, args);
  } catch (error) {
    if (error?.code === 1 && typeof error.stdout === "string") {
      return error.stdout.trimEnd();
    }
    throw error;
  }
}

async function collectUntrackedDiff(projectPath) {
  const rawPaths = await runGit(projectPath, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
  ]).catch(() => "");
  const paths = rawPaths
    .split("\0")
    .filter(Boolean)
    .filter(
      (path) =>
        path !== ROUNDTABLE_GIT_CONTEXT_DIRECTORY &&
        !path.startsWith(`${ROUNDTABLE_GIT_CONTEXT_DIRECTORY}/`),
    );
  const included = [];
  const omitted = [];
  const patches = [];
  let totalBytes = 0;

  for (const path of paths) {
    if (included.length >= MAX_UNTRACKED_FILES) {
      omitted.push(path);
      continue;
    }
    const fileSize = await stat(join(projectPath, path))
      .then((details) => (details.isFile() ? details.size : 0))
      .catch(() => 0);
    if (
      fileSize <= 0 ||
      fileSize > MAX_UNTRACKED_FILE_BYTES ||
      totalBytes + fileSize > MAX_UNTRACKED_PATCH_BYTES
    ) {
      omitted.push(path);
      continue;
    }
    const patch = await runGitDiff(projectPath, [
      "diff",
      "--no-index",
      "--no-ext-diff",
      "--no-textconv",
      "--binary",
      "--unified=20",
      "--",
      "/dev/null",
      path,
    ]).catch(() => "");
    if (!patch) {
      omitted.push(path);
      continue;
    }
    included.push(path);
    totalBytes += Buffer.byteLength(patch);
    patches.push(patch);
  }

  return {
    included,
    omitted,
    patch: [
      ...patches,
      ...(omitted.length
        ? [
            "# Untracked files omitted from inline patch evidence:",
            ...omitted.map((path) => `# - ${path}`),
          ]
        : []),
    ].join("\n\n"),
  };
}

async function resolveBaseRef(projectPath) {
  const candidates = [];
  const remoteHead = await runGit(projectPath, [
    "symbolic-ref",
    "--quiet",
    "--short",
    "refs/remotes/origin/HEAD",
  ]).catch(() => "");
  if (remoteHead) candidates.push(remoteHead);
  candidates.push("origin/main", "main", "origin/master", "master");
  for (const candidate of [...new Set(candidates)]) {
    const commit = await runGit(projectPath, [
      "rev-parse",
      "--verify",
      "--quiet",
      `${candidate}^{commit}`,
    ]).catch(() => "");
    if (commit) return { ref: candidate, commit };
  }
  return null;
}

export async function materializeGitContext(projectPath, workspace) {
  const insideWorkTree = await runGit(projectPath, [
    "rev-parse",
    "--is-inside-work-tree",
  ]).catch(() => "");
  if (insideWorkTree !== "true") return null;

  const [head, branch, status, recentLog, base] = await Promise.all([
    runGit(projectPath, ["rev-parse", "HEAD"]),
    runGit(projectPath, ["branch", "--show-current"]).catch(() => ""),
    runGit(projectPath, ["status", "--short", "--untracked-files=all"]).catch(
      () => "",
    ),
    runGit(projectPath, [
      "log",
      "--oneline",
      "--decorate",
      "--max-count=20",
    ]).catch(() => ""),
    resolveBaseRef(projectPath),
  ]);
  const parentCommit = await runGit(projectPath, [
    "rev-parse",
    "--verify",
    "--quiet",
    `${head}^`,
  ]).catch(() => "");
  const mergeBase = base
    ? await runGit(projectPath, ["merge-base", base.commit, head]).catch(
        () => "",
      )
    : "";
  const committedDiff = mergeBase
    ? await runGit(projectPath, [
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--find-renames",
        "--unified=40",
        `${mergeBase}...${head}`,
      ]).catch(() => "")
    : "";
  const headDiff = parentCommit
    ? await runGit(projectPath, [
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--find-renames",
        "--unified=40",
        `${parentCommit}..${head}`,
      ]).catch(() => "")
    : "";
  const [workingDiff, untracked] = await Promise.all([
    runGit(projectPath, [
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--find-renames",
      "--unified=20",
      "HEAD",
    ]).catch(() => ""),
    collectUntrackedDiff(projectPath),
  ]);

  if (resolve(projectPath) === resolve(workspace)) {
    throw new Error("Roundtable Git context must be materialized in a disposable workspace, not the source project.");
  }
  const contextDirectory = join(workspace, ROUNDTABLE_GIT_CONTEXT_DIRECTORY);
  // A project may contain a stale marker file from an older Roundtable build.
  // The disposable copy is ours to normalize; the source project is never
  // touched. Remove either a file or directory before creating the reserved
  // context directory so mkdir cannot fail with EEXIST/ENOTDIR.
  await rm(contextDirectory, { recursive: true, force: true });
  await mkdir(contextDirectory, { recursive: true });
  const metadata = {
    schemaVersion: 1,
    branch,
    head,
    parentCommit,
    baseRef: base?.ref || "",
    baseCommit: base?.commit || "",
    mergeBase,
    committedChangesIncluded: Boolean(committedDiff),
    headChangesIncluded: Boolean(headDiff),
    workingTreeChangesIncluded: Boolean(workingDiff || untracked.patch),
    untrackedChangesIncluded: untracked.included.length > 0,
    untrackedFilesIncluded: untracked.included,
    untrackedFilesOmitted: untracked.omitted,
  };
  const patchSections = [
    `# Roundtable repository change context`,
    `# HEAD ${head}`,
    `# Base ${base?.ref || "(unavailable)"} ${base?.commit || ""}`.trimEnd(),
    `# Merge-base ${mergeBase || "(unavailable)"}`,
    "",
    "# Committed branch changes",
    committedDiff || "# No committed changes from the detected base.",
    "",
    "# Working tree changes",
    workingDiff || "# No tracked working tree changes.",
    "",
    "# Untracked working tree changes",
    untracked.patch || "# No untracked working tree changes.",
    "",
  ];
  const headPatchSections = [
    "# Roundtable exact HEAD change context",
    `# HEAD ${head}`,
    `# Parent ${parentCommit || "(unavailable)"}`,
    "",
    headDiff || "# No committed changes from the immediate parent.",
    "",
  ];
  await Promise.all([
    writeFile(
      join(contextDirectory, "metadata.json"),
      `${JSON.stringify(metadata, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      join(contextDirectory, "changes.patch"),
      patchSections.join("\n"),
      "utf8",
    ),
    writeFile(
      join(contextDirectory, "head-changes.patch"),
      headPatchSections.join("\n"),
      "utf8",
    ),
    writeFile(
      join(contextDirectory, "status.txt"),
      `${status || "(clean)"}\n`,
      "utf8",
    ),
    writeFile(
      join(contextDirectory, "recent-log.txt"),
      `${recentLog || "(unavailable)"}\n`,
      "utf8",
    ),
  ]);
  return metadata;
}
