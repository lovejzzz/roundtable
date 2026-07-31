import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const ROUNDTABLE_GIT_CONTEXT_DIRECTORY = ".roundtable-context";

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
  const workingDiff = await runGit(projectPath, [
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--find-renames",
    "--unified=20",
    "HEAD",
  ]).catch(() => "");

  const contextDirectory = join(workspace, ROUNDTABLE_GIT_CONTEXT_DIRECTORY);
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
    workingTreeChangesIncluded: Boolean(workingDiff),
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
