import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  buildClaudeSandboxProfile,
  cleanupTestSandboxes,
  ensureTestSandbox,
  sweepStaleTestSandboxes,
} from "../scripts/test-sandbox.mjs";

const execFileAsync = promisify(execFile);

test("creates isolated per-agent project copies and removes them after the room ends", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "roundtable-sandbox-fixture-"));
  const projectPath = join(fixtureRoot, "project");
  const temporaryDirectory = join(fixtureRoot, "sandboxes");
  const session = { projectPath };

  try {
    await Promise.all([
      mkdir(join(projectPath, ".git"), { recursive: true }),
      mkdir(join(projectPath, ".next"), { recursive: true }),
      mkdir(join(projectPath, ".wrangler"), { recursive: true }),
      mkdir(join(projectPath, "dist"), { recursive: true }),
      mkdir(join(projectPath, "node_modules", "fixture"), { recursive: true }),
      mkdir(temporaryDirectory, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(projectPath, "source.txt"), "original\n"),
      writeFile(join(projectPath, ".git", "config"), "private metadata\n"),
      writeFile(join(projectPath, ".next", "cache"), "generated\n"),
      writeFile(join(projectPath, ".wrangler", "state"), "generated\n"),
      writeFile(join(projectPath, "dist", "bundle.js"), "generated\n"),
      writeFile(join(projectPath, "node_modules", "fixture", "index.js"), "dependency\n"),
    ]);

    const codexWorkspace = await ensureTestSandbox(session, "codex", {
      temporaryDirectory,
    });
    const reusedCodexWorkspace = await ensureTestSandbox(session, "codex", {
      temporaryDirectory,
    });
    const claudeWorkspace = await ensureTestSandbox(session, "claude", {
      temporaryDirectory,
    });

    assert.equal(reusedCodexWorkspace, codexWorkspace);
    assert.notEqual(claudeWorkspace, codexWorkspace);
    assert.equal(await readFile(join(codexWorkspace, "source.txt"), "utf8"), "original\n");
    assert.equal(
      await readFile(join(codexWorkspace, "node_modules", "fixture", "index.js"), "utf8"),
      "dependency\n",
    );
    await assert.rejects(access(join(codexWorkspace, ".git")));
    await assert.rejects(access(join(codexWorkspace, ".next")));
    await assert.rejects(access(join(codexWorkspace, ".wrangler")));
    await assert.rejects(access(join(codexWorkspace, "dist")));

    await writeFile(join(codexWorkspace, "source.txt"), "sandbox change\n");
    assert.equal(await readFile(join(projectPath, "source.txt"), "utf8"), "original\n");
    assert.equal(await readFile(join(claudeWorkspace, "source.txt"), "utf8"), "original\n");

    const codexRoot = dirname(codexWorkspace);
    const claudeRoot = dirname(claudeWorkspace);
    await cleanupTestSandboxes(session);
    await assert.rejects(access(codexRoot));
    await assert.rejects(access(claudeRoot));
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("removes only stale sandbox roots with the dedicated prefix", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "roundtable-sweep-fixture-"));
  const oldRoot = join(temporaryDirectory, "roundtable-agent-sandbox-codex-old");
  const currentRoot = join(temporaryDirectory, "roundtable-agent-sandbox-claude-current");
  const replyRoot = join(temporaryDirectory, "roundtable-agent-reply-old");
  try {
    await Promise.all([mkdir(oldRoot), mkdir(currentRoot), mkdir(replyRoot)]);
    await utimes(oldRoot, new Date(0), new Date(0));
    await sweepStaleTestSandboxes({
      temporaryDirectory,
      maxAgeMs: 1_000,
      clock: () => 10_000,
    });
    await assert.rejects(access(oldRoot));
    await access(currentRoot);
    await access(replyRoot);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("cancels sandbox preparation before an agent process starts", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "roundtable-copy-cancel-"));
  const session = { projectPath: "/fixture/project", stopRequested: false };
  try {
    await assert.rejects(
      ensureTestSandbox(session, "codex", {
        temporaryDirectory,
        copy: async (source, destination, options) => {
          assert.equal(options.filter(source), true);
          session.stopRequested = true;
          options.filter(join(source, "next-file"));
        },
      }),
      (error) => error?.code === "USER_STOP",
    );
    assert.deepEqual(await readdir(temporaryDirectory), []);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test(
  "the macOS Claude guard permits runtime state but blocks the project and sibling sandbox",
  { skip: platform() !== "darwin" },
  async (context) => {
    const fixtureRoot = await realpath(
      await mkdtemp(join(tmpdir(), "roundtable-guard-fixture-")),
    );
    const home = join(fixtureRoot, "home");
    const projectPath = join(home, "Documents", "project");
    const claudeWorkspace = join(fixtureRoot, "claude-workspace");
    const siblingRoot = join(fixtureRoot, "codex-workspace");
    try {
      await Promise.all([
        mkdir(join(home, ".claude", "session-env"), { recursive: true }),
        mkdir(projectPath, { recursive: true }),
        mkdir(claudeWorkspace),
        mkdir(siblingRoot),
      ]);
      const profile = buildClaudeSandboxProfile({
        home,
        homeEntries: [".claude", "Documents"],
        projectPath,
        siblingRoot,
      });
      try {
        await execFileAsync("/usr/bin/sandbox-exec", [
          "-p",
          profile,
          "/bin/sh",
          "-c",
          'printf allowed > "$1/allowed"; printf runtime > "$2/.claude/session-env/state"; printf denied > "$3/blocked" 2>/dev/null || true; printf denied > "$4/blocked" 2>/dev/null || true',
          "roundtable-guard",
          claudeWorkspace,
          home,
          projectPath,
          siblingRoot,
        ]);
      } catch (error) {
        if (/sandbox_apply: Operation not permitted/i.test(error?.stderr || "")) {
          context.skip("The current parent sandbox does not permit nested Seatbelt profiles.");
          return;
        }
        throw error;
      }
      await access(join(claudeWorkspace, "allowed"));
      await access(join(home, ".claude", "session-env", "state"));
      await assert.rejects(access(join(projectPath, "blocked")));
      await assert.rejects(access(join(siblingRoot, "blocked")));
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  },
);
