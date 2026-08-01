import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { rmSync } from "node:fs";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  realpath,
  rm,
  symlink,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { homedir, platform, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  HOST_PROTECTED_CREDENTIAL_PATHS,
  buildAntigravitySandboxProfile,
  buildCodexPermissionArgs,
  buildClaudeSandboxProfile,
  collectAncestorDirectoryEntries,
  cleanupTestSandboxes,
  cleanupTestSandboxesSync,
  clonePreparedTestSandbox,
  createDisposableTestSandbox,
  ensureTestSandbox,
  isolatedGitEnvironment,
  prepareTestSandboxes,
  removeDisposableTestSandbox,
  resolveCredentialPathAliases,
  sweepStaleTestSandboxes,
} from "../scripts/test-sandbox.mjs";
import { buildBrokerNetworkArgs } from "../scripts/test-broker.mjs";

const execFileAsync = promisify(execFile);
const CREDENTIAL_FILE_PATHS = new Set([".npmrc", ".netrc", ".git-credentials", ".pypirc"]);

test("synthetic Git drops every inherited Git control variable", () => {
  const environment = isolatedGitEnvironment({
    PATH: "/test/bin",
    GIT_TEMPLATE_DIR: "/host/templates",
    GIT_OBJECT_DIRECTORY: "/host/objects",
    GIT_ALTERNATE_OBJECT_DIRECTORIES: "/host/alternates",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.hooksPath",
    GIT_CONFIG_VALUE_0: "/host/hooks",
    GIT_DIR: "/host/repository",
  });
  assert.equal(environment.PATH, "/test/bin");
  assert.equal(environment.GIT_CONFIG_NOSYSTEM, "1");
  assert.equal(environment.GIT_CONFIG_GLOBAL, "/dev/null");
  assert.equal(environment.GIT_TERMINAL_PROMPT, "0");
  assert.equal(environment.GIT_AUTHOR_EMAIL, "snapshot@roundtable.invalid");
  assert.deepEqual(
    Object.keys(environment)
      .filter((name) => name.startsWith("GIT_"))
      .sort(),
    [
      "GIT_AUTHOR_EMAIL",
      "GIT_AUTHOR_NAME",
      "GIT_COMMITTER_EMAIL",
      "GIT_COMMITTER_NAME",
      "GIT_CONFIG_GLOBAL",
      "GIT_CONFIG_NOSYSTEM",
      "GIT_TERMINAL_PROMPT",
    ],
  );
});

function credentialProbePath(home, name) {
  return CREDENTIAL_FILE_PATHS.has(name) ? join(home, name) : join(home, name, "credential");
}

test("protects both lexical and canonical CLI credential-home paths", async () => {
  const fixtureRoot = await realpath(
    await mkdtemp(join(tmpdir(), "roundtable-credential-alias-fixture-")),
  );
  const home = join(fixtureRoot, "home");
  const canonicalCodexHome = join(fixtureRoot, "vault", "codex");
  const configuredCodexHome = join(home, "custom-codex");
  try {
    await Promise.all([mkdir(home), mkdir(canonicalCodexHome, { recursive: true })]);
    await symlink(canonicalCodexHome, configuredCodexHome);
    const protectedAliases = await resolveCredentialPathAliases([configuredCodexHome]);
    assert.deepEqual(protectedAliases, [configuredCodexHome, canonicalCodexHome]);

    const claudeProfile = buildClaudeSandboxProfile({
      home,
      homeEntries: ["custom-codex"],
      claudeHomeEntries: [],
      additionalProtectedPaths: protectedAliases,
      projectPath: join(fixtureRoot, "project"),
    });
    const antigravityProfile = buildAntigravitySandboxProfile({
      home,
      homeEntries: ["custom-codex"],
      additionalProtectedPaths: protectedAliases,
      projectPath: join(fixtureRoot, "project"),
    });
    const codexArgs = buildCodexPermissionArgs({
      additionalProtectedPaths: protectedAliases,
    }).join("\n");
    for (const path of protectedAliases) {
      assert.ok(claudeProfile.includes(`(deny file-read* (subpath "${path}"))`));
      assert.ok(antigravityProfile.includes(`(deny file-read* (subpath "${path}"))`));
      assert.ok(codexArgs.includes(`${JSON.stringify(path)}="deny"`));
    }
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("a nested Claude config home does not inherit a write denial from its ancestor", () => {
  const home = "/Users/example";
  const claudeHome = join(home, ".config", "claude");
  const profile = buildClaudeSandboxProfile({
    home,
    homeEntries: [".config", "Documents"],
    claudeHome,
    claudeHomeEntries: ["cache", "settings.json"],
    claudeHomeAncestorEntries: [
      {
        path: join(home, ".config"),
        entries: ["claude", "gh", "gcloud", "unrelated-app"],
      },
    ],
    projectPath: "/Users/example/project",
  });

  assert.doesNotMatch(profile, /deny file-write\* \(subpath "\/Users\/example\/\.config"\)/);
  assert.match(profile, /deny file-write\* \(literal "\/Users\/example\/\.config"\)/);
  assert.match(profile, /deny file-write\* \(regex #"\^\/Users\/example\/\\\.config\(\$\|\/\)"\)/);
  assert.match(
    profile,
    /allow file-write\* \(regex #"\^\/Users\/example\/\\\.config\/claude\/cache\(\$\|\/\)"\)/,
  );
  assert.match(profile, /deny file-write\* \(subpath "\/Users\/example\/Documents"\)/);
  assert.match(profile, /deny file-write\* \(subpath "\/Users\/example\/\.config\/gh"\)/);
  assert.match(
    profile,
    /deny file-write\* \(subpath "\/Users\/example\/\.config\/unrelated-app"\)/,
  );
  assert.doesNotMatch(
    profile,
    /deny file-write\* \(subpath "\/Users\/example\/\.config\/claude"\)/,
  );
  assert.match(
    profile,
    /deny file-write\* \(subpath "\/Users\/example\/\.config\/claude\/settings\.json"\)/,
  );
  assert.doesNotMatch(
    profile,
    /deny file-write\* \(subpath "\/Users\/example\/\.config\/claude\/cache"\)/,
  );
});

test("collects every nested config-home ancestor for sibling write isolation", async () => {
  const home = "/Users/example";
  const target = join(home, ".config", "vendor", "claude");
  const seen = [];
  const values = await collectAncestorDirectoryEntries(home, target, async (path) => {
    seen.push(path);
    return [{ name: "sibling" }];
  });
  assert.deepEqual(seen, [join(home, ".config", "vendor"), join(home, ".config")]);
  assert.deepEqual(
    values.map((value) => value.path),
    seen,
  );
});

test(
  "the macOS Claude guard allows nested runtime writes but blocks existing and new siblings",
  { skip: platform() !== "darwin" },
  async (context) => {
    const fixtureRoot = await realpath(
      await mkdtemp(join(tmpdir(), "roundtable-nested-claude-guard-")),
    );
    const home = join(fixtureRoot, "home");
    const configRoot = join(home, ".config");
    const claudeHome = join(configRoot, "claude");
    const existingSibling = join(configRoot, "gh");
    const newSibling = join(configRoot, "new-app");
    try {
      await Promise.all([
        mkdir(join(claudeHome, "cache"), { recursive: true }),
        mkdir(existingSibling, { recursive: true }),
      ]);
      await Promise.all([
        writeFile(join(claudeHome, "settings.json"), "{}\n"),
        writeFile(join(existingSibling, "config"), "original\n"),
      ]);
      const ancestors = await collectAncestorDirectoryEntries(home, claudeHome);
      const profile = buildClaudeSandboxProfile({
        home,
        homeEntries: [".config"],
        claudeHome,
        claudeHomeEntries: ["cache", "settings.json"],
        claudeHomeAncestorEntries: ancestors,
        projectPath: join(fixtureRoot, "project"),
      });
      try {
        await execFileAsync("/usr/bin/sandbox-exec", [
          "-p",
          profile,
          "/bin/sh",
          "-c",
          'printf runtime > "$1/cache/state"; if printf blocked > "$2/config" 2>/dev/null; then exit 42; fi; if mkdir "$3" 2>/dev/null; then exit 43; fi',
          "roundtable-nested-claude-guard",
          claudeHome,
          existingSibling,
          newSibling,
        ]);
      } catch (error) {
        if (/sandbox_apply: Operation not permitted/i.test(error?.stderr || "")) {
          context.skip("The current parent sandbox does not permit nested Seatbelt profiles.");
          return;
        }
        throw error;
      }
      assert.equal(await readFile(join(claudeHome, "cache", "state"), "utf8"), "runtime");
      assert.equal(await readFile(join(existingSibling, "config"), "utf8"), "original\n");
      await assert.rejects(access(newSibling));
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  },
);

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
      mkdir(join(projectPath, "verification-output"), { recursive: true }),
      mkdir(join(projectPath, "node_modules", "fixture"), { recursive: true }),
      mkdir(temporaryDirectory, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(projectPath, "source.txt"), "original\n"),
      writeFile(join(projectPath, ".git", "config"), "private metadata\n"),
      writeFile(join(projectPath, ".next", "cache"), "generated\n"),
      writeFile(join(projectPath, ".wrangler", "state"), "generated\n"),
      writeFile(join(projectPath, "dist", "bundle.js"), "generated\n"),
      writeFile(join(projectPath, "verification-output", "old-report.json"), "generated\n"),
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
    await assert.rejects(access(join(codexWorkspace, "verification-output")));

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

test("validates one preparation source while keeping role and broker freshness contracts distinct", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "roundtable-prepared-source-fixture-"));
  const projectPath = join(fixtureRoot, "project");
  const temporaryDirectory = join(fixtureRoot, "sandboxes");
  const session = { projectPath };
  const copyCalls = [];
  let validationCalls = 0;
  let materializationCalls = 0;

  try {
    await Promise.all([
      mkdir(join(projectPath, "node_modules", "fixture"), { recursive: true }),
      mkdir(temporaryDirectory, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(projectPath, "source.txt"), "session start\n"),
      writeFile(join(projectPath, "node_modules", "fixture", "index.js"), "dependency\n"),
    ]);

    const [codexWorkspace, claudeWorkspace, antigravityWorkspace] =
      await prepareTestSandboxes(session, ["codex", "claude", "antigravity"], {
        temporaryDirectory,
        copy: async (source, destination, options) => {
          copyCalls.push([source, destination]);
          return cp(source, destination, options);
        },
        validateSymlinks: async () => {
          validationCalls += 1;
        },
        materializeContext: async (_project, workspace) => {
          materializationCalls += 1;
          await mkdir(join(workspace, ".roundtable-context"));
          await writeFile(
            join(workspace, ".roundtable-context", "metadata.json"),
            '{"snapshot":"session-start"}\n',
          );
        },
      });

    assert.equal(copyCalls.length, 4);
    assert.equal(copyCalls[0][0], projectPath);
    assert.ok(copyCalls.slice(1).every(([source]) => source === session.testSandboxSource.workspace));
    assert.equal(validationCalls, 1);
    assert.equal(materializationCalls, 1);
    assert.equal(
      await readFile(join(codexWorkspace, ".roundtable-context", "metadata.json"), "utf8"),
      '{"snapshot":"session-start"}\n',
    );
    assert.equal(
      await readFile(join(codexWorkspace, "node_modules", "fixture", "index.js"), "utf8"),
      "dependency\n",
    );
    await assert.rejects(access(join(claudeWorkspace, "node_modules")));
    await assert.rejects(access(join(antigravityWorkspace, "node_modules")));

    await writeFile(join(projectPath, "source.txt"), "host changed\n");
    const broker = await createDisposableTestSandbox(session, "claude-broker", {
      temporaryDirectory,
    });
    assert.equal(await readFile(join(codexWorkspace, "source.txt"), "utf8"), "session start\n");
    assert.equal(await readFile(join(antigravityWorkspace, "source.txt"), "utf8"), "session start\n");
    assert.equal(await readFile(join(broker.workspace, "source.txt"), "utf8"), "host changed\n");
    await removeDisposableTestSandbox(broker);

    const sourceRoot = session.testSandboxSource.root;
    await cleanupTestSandboxes(session);
    await assert.rejects(access(sourceRoot));
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("keeps cancellation and the injected copy seam on prepared role clones", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "roundtable-prepared-clone-cancel-"));
  const projectPath = join(fixtureRoot, "project");
  const temporaryDirectory = join(fixtureRoot, "sandboxes");
  const session = { projectPath, stopRequested: false };
  try {
    await Promise.all([mkdir(projectPath), mkdir(temporaryDirectory)]);
    await writeFile(join(projectPath, "source.txt"), "source\n");
    await prepareTestSandboxes(session, [], { temporaryDirectory });

    await assert.rejects(
      ensureTestSandbox(session, "codex", {
        temporaryDirectory,
        preparedSource: session.testSandboxSource,
        copy: async (source, destination, options) => {
          assert.equal(await options.filter(source, destination), true);
          session.stopRequested = true;
          await options.filter(join(source, "next-file"), join(destination, "next-file"));
        },
      }),
      (error) => error?.code === "USER_STOP",
    );
  } finally {
    await cleanupTestSandboxes(session);
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("cleanup waits for in-flight source materialization and removes its late root", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "roundtable-source-cleanup-race-"));
  const projectPath = join(fixtureRoot, "project");
  const temporaryDirectory = join(fixtureRoot, "sandboxes");
  const session = { projectPath, stopRequested: false };
  let releaseMaterialization;
  let materializationStarted;
  const materializationGate = new Promise((resolve) => {
    releaseMaterialization = resolve;
  });
  const started = new Promise((resolve) => {
    materializationStarted = resolve;
  });
  try {
    await Promise.all([mkdir(projectPath), mkdir(temporaryDirectory)]);
    await writeFile(join(projectPath, "source.txt"), "source\n");
    const preparation = prepareTestSandboxes(session, ["codex"], {
      temporaryDirectory,
      materializeContext: async () => {},
      materializeSnapshot: async () => {
        materializationStarted();
        await materializationGate;
      },
      validateSymlinks: async () => {},
    });
    await started;
    const rejectedPreparation = assert.rejects(
      preparation,
      (error) => error?.code === "USER_STOP",
    );
    session.stopRequested = true;
    let cleanupFinished = false;
    const cleanup = cleanupTestSandboxes(session).then(() => {
      cleanupFinished = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(cleanupFinished, false);
    releaseMaterialization();
    await rejectedPreparation;
    await cleanup;
    assert.equal(session.testSandboxSource, null);
    assert.deepEqual(await readdir(temporaryDirectory), []);
  } finally {
    releaseMaterialization?.();
    await cleanupTestSandboxes(session);
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("both sandbox creation paths register roots before canonicalization can pause", async () => {
  for (const mode of ["source", "clone"]) {
    const fixtureRoot = await mkdtemp(join(tmpdir(), `roundtable-root-ownership-${mode}-`));
    const projectPath = join(fixtureRoot, "project");
    const temporaryDirectory = join(fixtureRoot, "sandboxes");
    const session = { projectPath, stopRequested: false };
    let releaseCanonicalization;
    let canonicalizationStarted;
    const canonicalizationGate = new Promise((resolve) => {
      releaseCanonicalization = resolve;
    });
    const started = new Promise((resolve) => {
      canonicalizationStarted = resolve;
    });
    try {
      await Promise.all([mkdir(projectPath), mkdir(temporaryDirectory)]);
      await writeFile(join(projectPath, "source.txt"), "source\n");
      const options = {
        temporaryDirectory,
        resolveRoot: async (path) => {
          canonicalizationStarted();
          await canonicalizationGate;
          return realpath(path);
        },
        materializeContext: async () => {},
        materializeSnapshot: async () => {},
        validateSymlinks: async () => {},
      };
      const creation =
        mode === "source"
          ? createDisposableTestSandbox(session, "source", options)
          : clonePreparedTestSandbox(session, "codex", { workspace: projectPath }, options);
      const rejectedCreation = assert.rejects(creation);
      await started;
      session.stopRequested = true;
      let cleanupFinished = false;
      const cleanup = cleanupTestSandboxes(session).then(() => {
        cleanupFinished = true;
      });
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(cleanupFinished, false);
      releaseCanonicalization();
      await rejectedCreation;
      await cleanup;
      assert.deepEqual(await readdir(temporaryDirectory), []);
    } finally {
      releaseCanonicalization?.();
      await cleanupTestSandboxes(session);
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  }
});

test("cleanup cannot return before a paused role clone finishes its last write", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "roundtable-role-cleanup-race-"));
  const projectPath = join(fixtureRoot, "project");
  const temporaryDirectory = join(fixtureRoot, "sandboxes");
  const session = { projectPath, stopRequested: false };
  let releaseClone;
  let cloneStarted;
  const cloneGate = new Promise((resolve) => {
    releaseClone = resolve;
  });
  const started = new Promise((resolve) => {
    cloneStarted = resolve;
  });
  try {
    await Promise.all([mkdir(projectPath), mkdir(temporaryDirectory)]);
    await writeFile(join(projectPath, "source.txt"), "source\n");
    const preparation = prepareTestSandboxes(session, ["codex"], {
      temporaryDirectory,
      copy: async (source, destination, options) => {
        if (source !== projectPath) {
          cloneStarted();
          await cloneGate;
          await mkdir(destination, { recursive: true });
          await writeFile(join(destination, "late-write.txt"), "late\n");
          return;
        }
        return cp(source, destination, options);
      },
      materializeContext: async () => {},
      materializeSnapshot: async () => {},
      validateSymlinks: async () => {},
    });
    await started;
    const rejectedPreparation = assert.rejects(
      preparation,
      (error) => error?.code === "USER_STOP",
    );
    session.stopRequested = true;
    let cleanupFinished = false;
    const cleanup = cleanupTestSandboxes(session).then(() => {
      cleanupFinished = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(cleanupFinished, false);
    releaseClone();
    await rejectedPreparation;
    await cleanup;
    assert.equal(session.testSandboxSource, null);
    assert.deepEqual(await readdir(temporaryDirectory), []);
  } finally {
    releaseClone?.();
    await cleanupTestSandboxes(session);
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("emergency synchronous cleanup removes every registered root before force exit", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "roundtable-emergency-cleanup-"));
  const sandboxRoot = join(fixtureRoot, "roundtable-agent-sandbox-late-copy");
  const session = {
    testSandboxRoots: new Set([sandboxRoot]),
    testSandboxes: new Map(),
  };
  try {
    await mkdir(join(sandboxRoot, "workspace"), { recursive: true });
    await writeFile(join(sandboxRoot, "workspace", "late.txt"), "late\n");
    cleanupTestSandboxesSync(session);
    await assert.rejects(access(sandboxRoot));
    assert.equal(session.testSandboxRoots.size, 0);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("cleanup isolates root removal failures and a later sweep can recover", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "roundtable-removal-retry-"));
  const firstRoot = join(fixtureRoot, "roundtable-agent-sandbox-first");
  const secondRoot = join(fixtureRoot, "roundtable-agent-sandbox-second");
  const session = {
    testSandboxRoots: new Set([firstRoot, secondRoot]),
    testSandboxes: new Map(),
  };
  let firstAttempts = 0;
  try {
    await Promise.all([
      mkdir(join(firstRoot, "workspace"), { recursive: true }),
      mkdir(join(secondRoot, "workspace"), { recursive: true }),
    ]);
    const result = await cleanupTestSandboxes(session, {
      removeRoot: async (root, options) => {
        assert.equal(options.maxRetries, 3);
        assert.equal(options.retryDelay, 100);
        if (root === firstRoot && firstAttempts++ === 0) {
          const error = new Error("directory changed during removal");
          error.code = "ENOTEMPTY";
          throw error;
        }
        return rm(root, options);
      },
    });
    assert.equal(result.failures.length, 1);
    await assert.rejects(access(firstRoot));
    await assert.rejects(access(secondRoot));
    assert.ok(session.testSandboxRoots.has(firstRoot));
    assert.ok(session.testSandboxRoots.has(secondRoot));
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("emergency cleanup continues after one root removal throws", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "roundtable-emergency-isolation-"));
  const firstRoot = join(fixtureRoot, "roundtable-agent-sandbox-first");
  const secondRoot = join(fixtureRoot, "roundtable-agent-sandbox-second");
  const session = {
    testSandboxRoots: new Set([firstRoot, secondRoot]),
    testSandboxes: new Map(),
  };
  try {
    await Promise.all([mkdir(firstRoot), mkdir(secondRoot)]);
    cleanupTestSandboxesSync(session, {
      removeRootSync: (root, options) => {
        assert.equal(options.maxRetries, 3);
        if (root === firstRoot) throw new Error("busy root");
        rmSync(root, options);
      },
    });
    await access(firstRoot);
    await assert.rejects(access(secondRoot));
    assert.ok(session.testSandboxRoots.has(firstRoot));
    assert.equal(session.testSandboxRoots.has(secondRoot), false);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("materializes sanitized Git evidence plus a remote-free disposable snapshot", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "roundtable-git-context-fixture-"));
  const projectPath = join(fixtureRoot, "project");
  const temporaryDirectory = join(fixtureRoot, "sandboxes");
  const session = { projectPath };
  try {
    await Promise.all([mkdir(projectPath), mkdir(temporaryDirectory)]);
    await execFileAsync("git", ["init", "-b", "main"], { cwd: projectPath });
    await execFileAsync("git", ["config", "user.name", "Roundtable Test"], {
      cwd: projectPath,
    });
    await execFileAsync("git", ["config", "user.email", "roundtable@example.test"], {
      cwd: projectPath,
    });
    await writeFile(join(projectPath, "source.txt"), "base\n");
    await writeFile(join(projectPath, "removed.txt"), "remove me\n");
    await writeFile(join(projectPath, "renamed-old.txt"), "rename me\n");
    await writeFile(join(projectPath, ".gitignore"), "verification-output/\n");
    await mkdir(join(projectPath, "verification-output", "quality"), { recursive: true });
    await writeFile(
      join(projectPath, "verification-output", "quality", "tracked-receipt.json"),
      '{"status":"passed"}\n',
    );
    await execFileAsync("git", ["add", "source.txt", "removed.txt", "renamed-old.txt", ".gitignore"], {
      cwd: projectPath,
    });
    await execFileAsync(
      "git",
      ["add", "--force", "verification-output/quality/tracked-receipt.json"],
      { cwd: projectPath },
    );
    await execFileAsync("git", ["commit", "-m", "base"], { cwd: projectPath });
    await execFileAsync("git", ["checkout", "-b", "feature/trust-audit"], {
      cwd: projectPath,
    });
    await writeFile(join(projectPath, "source.txt"), "branch change\n");
    await execFileAsync("git", ["add", "source.txt"], { cwd: projectPath });
    await execFileAsync("git", ["commit", "-m", "branch change"], {
      cwd: projectPath,
    });
    await writeFile(join(projectPath, "source.txt"), "working change\n");
    await writeFile(
      join(projectPath, "verification-output", "quality", "local-only.json"),
      '{"status":"untracked"}\n',
    );
    await unlink(join(projectPath, "removed.txt"));
    await execFileAsync("git", ["mv", "renamed-old.txt", "renamed-new.txt"], {
      cwd: projectPath,
    });
    await writeFile(join(projectPath, "new-module.mjs"), "export const trackedByRoundtable = true;\n");

    const workspace = await ensureTestSandbox(session, "codex", {
      temporaryDirectory,
    });
    const metadata = JSON.parse(
      await readFile(join(workspace, ".roundtable-context", "metadata.json"), "utf8"),
    );
    const patch = await readFile(join(workspace, ".roundtable-context", "changes.patch"), "utf8");
    const headPatch = await readFile(
      join(workspace, ".roundtable-context", "head-changes.patch"),
      "utf8",
    );

    assert.equal(metadata.branch, "feature/trust-audit");
    assert.equal(metadata.baseRef, "main");
    assert.match(metadata.parentCommit, /^[a-f0-9]{40}$/);
    assert.equal(metadata.committedChangesIncluded, true);
    assert.equal(metadata.headChangesIncluded, true);
    assert.equal(metadata.workingTreeChangesIncluded, true);
    assert.equal(metadata.untrackedChangesIncluded, true);
    assert.deepEqual(metadata.untrackedFilesIncluded, ["new-module.mjs"]);
    assert.deepEqual(metadata.untrackedFilesOmitted, []);
    assert.match(patch, /branch change/);
    assert.match(patch, /working change/);
    assert.match(patch, /new-module\.mjs/);
    assert.match(patch, /export const trackedByRoundtable = true/);
    assert.match(headPatch, /branch change/);
    assert.doesNotMatch(headPatch, /working change/);
    assert.doesNotMatch(headPatch, /new-module\.mjs/);
    assert.match(headPatch, new RegExp(`# Parent ${metadata.parentCommit}`));
    await access(join(workspace, ".git"));
    assert.equal(
      await readFile(
        join(workspace, "verification-output", "quality", "tracked-receipt.json"),
        "utf8",
      ),
      '{"status":"passed"}\n',
    );
    await assert.rejects(
      access(join(workspace, "verification-output", "quality", "local-only.json")),
    );
    const { stdout: remotes } = await execFileAsync("git", ["remote"], { cwd: workspace });
    const { stdout: tracked } = await execFileAsync("git", ["ls-files"], { cwd: workspace });
    const { stdout: status } = await execFileAsync("git", ["status", "--short"], { cwd: workspace });
    const { stdout: changedFromBaseline } = await execFileAsync(
      "git",
      ["diff", "--name-only", "origin/main...HEAD"],
      { cwd: workspace },
    );
    const { stdout: changedStatusFromBaseline } = await execFileAsync(
      "git",
      ["diff", "--name-status", "--find-renames", "origin/main...HEAD"],
      { cwd: workspace },
    );
    const { stdout: subject } = await execFileAsync("git", ["log", "-1", "--pretty=%s"], {
      cwd: workspace,
    });
    const syntheticConfig = await readFile(join(workspace, ".git", "config"), "utf8");
    assert.equal(remotes, "");
    assert.deepEqual(tracked.trim().split("\n").sort(), [
      ".gitignore",
      "new-module.mjs",
      "renamed-new.txt",
      "source.txt",
      "verification-output/quality/tracked-receipt.json",
    ]);
    assert.equal(status, "");
    assert.deepEqual(changedFromBaseline.trim().split("\n").sort(), [
      "new-module.mjs",
      "removed.txt",
      "renamed-new.txt",
      "source.txt",
    ]);
    assert.match(
      changedStatusFromBaseline,
      /R100\trenamed-old\.txt\trenamed-new\.txt/,
    );
    assert.equal(subject.trim(), "Roundtable disposable snapshot");
    assert.doesNotMatch(syntheticConfig, /Roundtable Test|roundtable@example\.test|remote /);
  } finally {
    await cleanupTestSandboxes(session);
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("creates fresh request-scoped broker copies and removes each immediately", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "roundtable-request-sandbox-"));
  const projectPath = join(fixtureRoot, "project");
  const temporaryDirectory = join(fixtureRoot, "sandboxes");
  const session = { projectPath };
  try {
    await Promise.all([mkdir(projectPath), mkdir(temporaryDirectory)]);
    await writeFile(join(projectPath, "source.txt"), "original\n");
    const first = await createDisposableTestSandbox(session, "claude-broker", {
      temporaryDirectory,
    });
    await writeFile(join(first.workspace, "source.txt"), "first request\n");
    await removeDisposableTestSandbox(first);
    await assert.rejects(access(first.root));

    const second = await createDisposableTestSandbox(session, "claude-broker", {
      temporaryDirectory,
    });
    assert.notEqual(second.root, first.root);
    assert.equal(await readFile(join(second.workspace, "source.txt"), "utf8"), "original\n");
    await removeDisposableTestSandbox(second);
    assert.deepEqual(await readdir(temporaryDirectory), []);
    assert.equal(session.testSandboxes, undefined);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("preserves safe internal symlinks and rejects links whose copied meaning escapes", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "roundtable-symlink-fixture-"));
  const actualProjectPath = join(fixtureRoot, "project");
  const temporaryDirectory = join(fixtureRoot, "sandboxes");
  const externalPath = join(fixtureRoot, "external-secret");
  try {
    await Promise.all([
      mkdir(join(actualProjectPath, "a"), { recursive: true }),
      mkdir(join(actualProjectPath, "b"), { recursive: true }),
      mkdir(temporaryDirectory, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(actualProjectPath, "b", "value.txt"), "inside\n"),
      writeFile(externalPath, "outside\n"),
    ]);
    await symlink("../b/value.txt", join(actualProjectPath, "a", "inside"));

    const safeSession = { projectPath: await realpath(actualProjectPath) };
    const workspace = await ensureTestSandbox(safeSession, "codex", {
      temporaryDirectory,
    });
    assert.equal(await readlink(join(workspace, "a", "inside")), "../b/value.txt");
    assert.equal(await realpath(join(workspace, "a", "inside")), join(workspace, "b", "value.txt"));
    await cleanupTestSandboxes(safeSession);

    const unsafeLinks = [
      ["escape-external", externalPath],
      ["escape-absolute-internal", join(actualProjectPath, "b", "value.txt")],
      ["a/escape-out-and-back", "../../project/b/value.txt"],
    ];
    for (const [name, target] of unsafeLinks) {
      const linkPath = join(actualProjectPath, name);
      await symlink(target, linkPath);
      const unsafeSession = { projectPath: await realpath(actualProjectPath) };
      await assert.rejects(
        ensureTestSandbox(unsafeSession, "claude", { temporaryDirectory }),
        (error) => error?.code === "UNSAFE_SYMLINK" && error.message.includes(name),
      );
      await rm(linkPath);
      assert.deepEqual(await readdir(temporaryDirectory), []);
    }
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("post-copy verification removes a root if a copied symlink escapes", async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "roundtable-post-copy-fixture-"));
  const projectPath = join(fixtureRoot, "project");
  const temporaryDirectory = join(fixtureRoot, "sandboxes");
  const externalPath = join(fixtureRoot, "external");
  try {
    await Promise.all([
      mkdir(projectPath),
      mkdir(temporaryDirectory),
      writeFile(externalPath, "outside\n"),
    ]);
    const session = { projectPath: await realpath(projectPath) };
    await assert.rejects(
      ensureTestSandbox(session, "codex", {
        temporaryDirectory,
        copy: async (source, destination, options) => {
          assert.equal(await options.filter(source, destination), true);
          await mkdir(destination);
          await symlink(externalPath, join(destination, "late-escape"));
        },
      }),
      (error) => error?.code === "UNSAFE_SYMLINK" && error.message.includes("late-escape"),
    );
    assert.deepEqual(await readdir(temporaryDirectory), []);
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
          assert.equal(await options.filter(source, destination), true);
          session.stopRequested = true;
          await options.filter(join(source, "next-file"));
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
  "the macOS Claude guard permits runtime state but blocks credentials, the project, and sibling sandbox",
  { skip: platform() !== "darwin" },
  async (context) => {
    const fixtureRoot = await realpath(await mkdtemp(join(tmpdir(), "roundtable-guard-fixture-")));
    const home = join(fixtureRoot, "home");
    const projectPath = join(home, "Documents", "project");
    const claudeWorkspace = join(fixtureRoot, "claude-workspace");
    const siblingRoot = join(fixtureRoot, "codex-workspace");
    const relocatedCodexHome = join(home, "custom-codex-home");
    const relocatedAntigravityHome = join(home, "custom-antigravity-home");
    try {
      await Promise.all([
        mkdir(join(home, ".claude", "session-env"), { recursive: true }),
        mkdir(join(home, ".codex"), { recursive: true }),
        mkdir(join(home, ".antigravity"), { recursive: true }),
        mkdir(join(home, ".gemini"), { recursive: true }),
        mkdir(projectPath, { recursive: true }),
        mkdir(claudeWorkspace),
        mkdir(siblingRoot),
        mkdir(relocatedCodexHome, { recursive: true }),
        mkdir(relocatedAntigravityHome, { recursive: true }),
        ...HOST_PROTECTED_CREDENTIAL_PATHS.map((name) =>
          mkdir(dirname(credentialProbePath(home, name)), { recursive: true }),
        ),
      ]);
      await Promise.all([
        writeFile(join(home, ".claude", "session-env", "readable"), "runtime\n"),
        writeFile(join(home, ".claude", "settings.json"), "{}\n"),
        writeFile(join(home, ".codex", "auth.json"), "codex\n"),
        writeFile(join(home, ".antigravity", "credentials.json"), "antigravity\n"),
        writeFile(join(home, ".gemini", "oauth.json"), "gemini\n"),
        writeFile(join(relocatedCodexHome, "auth.json"), "relocated-codex\n"),
        writeFile(join(relocatedAntigravityHome, "credentials.json"), "relocated-antigravity\n"),
        writeFile(join(projectPath, "original-source"), "project\n"),
        writeFile(join(siblingRoot, "visible"), "sibling\n"),
        ...HOST_PROTECTED_CREDENTIAL_PATHS.map((name) =>
          writeFile(credentialProbePath(home, name), `secret:${name}\n`),
        ),
      ]);
      const profile = buildClaudeSandboxProfile({
        home,
        homeEntries: [
          ".claude",
          ".antigravity",
          ".gemini",
          "Documents",
          ...new Set(HOST_PROTECTED_CREDENTIAL_PATHS.map((name) => name.split("/")[0])),
        ],
        claudeHomeEntries: ["session-env", "settings.json"],
        additionalProtectedPaths: [relocatedCodexHome, relocatedAntigravityHome],
        projectPath,
        siblingRoot,
      });
      for (const name of HOST_PROTECTED_CREDENTIAL_PATHS) {
        assert.ok(
          profile.includes(`(deny file-read* (subpath "${join(home, name)}"))`),
          `${name} should be protected`,
        );
      }
      assert.ok(profile.includes(`(deny file-read* (subpath "${join(home, ".codex")}"))`));
      assert.ok(profile.includes(`(deny file-read* (subpath "${join(home, ".antigravity")}"))`));
      assert.ok(profile.includes(`(deny file-read* (subpath "${join(home, ".gemini")}"))`));
      assert.ok(profile.includes(`(deny file-read* (subpath "${relocatedCodexHome}"))`));
      assert.ok(profile.includes(`(deny file-read* (subpath "${relocatedAntigravityHome}"))`));
      assert.ok(profile.includes(`(deny file-read* (subpath "${projectPath}"))`));
      try {
        await execFileAsync("/usr/bin/sandbox-exec", [
          "-p",
          profile,
          "/bin/sh",
          "-c",
          'printf allowed > "$1/allowed"; cat "$2/.claude/session-env/readable" >/dev/null; printf runtime > "$2/.claude/session-env/state"; shift 4; for credential in "$@"; do if cat "$credential" >/dev/null 2>&1; then exit 42; fi; done',
          "roundtable-guard",
          claudeWorkspace,
          home,
          projectPath,
          siblingRoot,
          ...HOST_PROTECTED_CREDENTIAL_PATHS.map((name) => credentialProbePath(home, name)),
          join(home, ".codex", "auth.json"),
          join(home, ".antigravity", "credentials.json"),
          join(home, ".gemini", "oauth.json"),
          join(relocatedCodexHome, "auth.json"),
          join(relocatedAntigravityHome, "credentials.json"),
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
      await assert.rejects(
        execFileAsync("/usr/bin/sandbox-exec", [
          "-p",
          profile,
          "/bin/sh",
          "-c",
          'printf changed > "$1/settings.json"',
          "roundtable-claude-settings-write",
          join(home, ".claude"),
        ]),
      );
      await assert.rejects(
        execFileAsync("/usr/bin/sandbox-exec", [
          "-p",
          profile,
          "/bin/sh",
          "-c",
          'printf denied > "$1/blocked"',
          "roundtable-project-write",
          projectPath,
        ]),
      );
      await assert.rejects(
        execFileAsync("/usr/bin/sandbox-exec", [
          "-p",
          profile,
          "/bin/sh",
          "-c",
          'cat "$1/original-source"',
          "roundtable-project-read",
          projectPath,
        ]),
      );
      await assert.rejects(
        execFileAsync("/usr/bin/sandbox-exec", [
          "-p",
          profile,
          "/bin/sh",
          "-c",
          'cat "$1/visible"',
          "roundtable-sibling-read",
          siblingRoot,
        ]),
      );
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  },
);

test("the Codex native permission profile preserves workspace semantics and denies host reads", () => {
  const siblingRoot = "/private/tmp/roundtable-agent-sandbox-claude-example";
  const projectPath = "/Users/example/project";
  const relocatedClaudeHome = "/Users/example/custom-claude-home";
  const workspaceArgs = buildCodexPermissionArgs({
    siblingRoot,
    projectPath,
    additionalProtectedPaths: [relocatedClaudeHome, "/Users/example/.claude"],
    home: "/Users/example",
  });
  const readOnlyArgs = buildCodexPermissionArgs({ readOnly: true });
  const workspaceText = workspaceArgs.join("\n");
  const readOnlyText = readOnlyArgs.join("\n");

  assert.match(workspaceText, /default_permissions="roundtable_workspace"/);
  assert.match(workspaceText, /extends=":workspace"/);
  assert.match(readOnlyText, /default_permissions="roundtable_read_only"/);
  assert.match(readOnlyText, /extends=":read-only"/);
  for (const name of HOST_PROTECTED_CREDENTIAL_PATHS) {
    assert.ok(
      workspaceText.includes(`${JSON.stringify(join("/Users/example", name))}="deny"`),
      `${name} should be denied`,
    );
  }
  assert.ok(workspaceText.includes('"/Users/example/.claude"="deny"'));
  assert.equal(workspaceText.match(/"\/Users\/example\/\.claude"="deny"/g)?.length, 1);
  assert.ok(workspaceText.includes('"/Users/example/.claude.json"="deny"'));
  assert.ok(workspaceText.includes('"/Users/example/.antigravity"="deny"'));
  assert.ok(workspaceText.includes('"/Users/example/.gemini"="deny"'));
  assert.ok(workspaceText.includes(`${JSON.stringify(siblingRoot)}="deny"`));
  assert.ok(workspaceText.includes(`${JSON.stringify(projectPath)}="deny"`));
  assert.ok(workspaceText.includes(`${JSON.stringify(relocatedClaudeHome)}="deny"`));
  assert.doesNotMatch(workspaceText, /\/Users\/example\/\.codex/);
});

test(
  "the broker sandbox permits loopback and workspace output while denying external network and protected paths",
  { skip: platform() !== "darwin" },
  async (context) => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "roundtable-broker-fixture-"));
    const workspace = join(fixtureRoot, "workspace");
    const protectedProject = join(fixtureRoot, "original-project");
    try {
      await Promise.all([mkdir(workspace), mkdir(protectedProject)]);
      const marker = join(protectedProject, "marker");
      await writeFile(marker, "protected\n");
      const args = [
        "sandbox",
        "-P",
        "roundtable_workspace",
        "-C",
        workspace,
        ...buildCodexPermissionArgs({
          home: homedir(),
          projectPath: protectedProject,
          additionalProtectedPaths: [homedir()],
        }),
        ...buildBrokerNetworkArgs(),
        process.execPath,
        "-e",
        `const fs = require("fs");
const net = require("net");
fs.writeFileSync("generated.txt", "allowed");
let readDenied = false;
try { fs.readFileSync(process.argv[1]); } catch (error) {
  readDenied = ["EPERM", "EACCES"].includes(error.code);
}
const server = net.createServer((socket) => socket.end("ok"));
server.once("error", () => process.exit(42));
server.listen(0, "127.0.0.1", () => {
  const local = net.connect(server.address().port, "127.0.0.1");
  local.once("error", () => process.exit(43));
  local.once("data", () => {
    local.destroy();
    const external = net.connect({ host: "1.1.1.1", port: 80, timeout: 1_000 });
    external.once("connect", () => process.exit(44));
    external.once("error", (error) => {
      const externalDenied = ["EPERM", "EACCES", "ENETUNREACH", "ECONNREFUSED"].includes(error.code);
      server.close(() => process.exit(readDenied && externalDenied ? 0 : 45));
    });
    external.once("timeout", () => {
      external.destroy();
      server.close(() => process.exit(readDenied ? 0 : 46));
    });
  });
});
`,
        marker,
      ];
      try {
        await execFileAsync("codex", args);
      } catch (error) {
        if (
          error?.code === "ENOENT" ||
          error?.code === "EPERM" ||
          /sandbox_apply: Operation not permitted/i.test(error?.stderr || "")
        ) {
          context.skip("The Codex command sandbox is unavailable in this environment.");
          return;
        }
        throw error;
      }
      assert.equal(await readFile(join(workspace, "generated.txt"), "utf8"), "allowed");
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  },
);

test("the Antigravity guard preserves its runtime roots and isolates host and agent data", () => {
  const home = "/Users/example";
  const projectPath = "/Users/example/project";
  const siblingRoots = [
    "/private/tmp/roundtable-agent-sandbox-codex-example",
    "/private/tmp/roundtable-agent-sandbox-claude-example",
  ];
  const relocatedCodexHome = "/Users/example/custom-codex-home";
  const relocatedClaudeHome = "/Users/example/custom-claude-home";
  const profile = buildAntigravitySandboxProfile({
    home,
    homeEntries: [".antigravity", ".gemini", ".codex", ".claude", "Documents"],
    projectPath,
    siblingRoots,
    additionalProtectedPaths: [relocatedCodexHome, relocatedClaudeHome],
  });

  assert.ok(profile.includes(`(deny file-read* (subpath "${join(home, ".codex")}"))`));
  assert.ok(profile.includes(`(deny file-read* (subpath "${join(home, ".claude")}"))`));
  assert.ok(profile.includes(`(deny file-read* (subpath "${projectPath}"))`));
  assert.ok(profile.includes(`(deny file-read* (subpath "${relocatedCodexHome}"))`));
  assert.ok(profile.includes(`(deny file-read* (subpath "${relocatedClaudeHome}"))`));
  assert.doesNotMatch(profile, /deny file-write\* \(subpath "\/Users\/example\/\.antigravity"\)/);
  assert.doesNotMatch(profile, /deny file-write\* \(subpath "\/Users\/example\/\.gemini"\)/);
  for (const root of siblingRoots) {
    assert.ok(profile.includes(`(deny file-read* (subpath "${root}"))`));
    assert.ok(profile.includes(`(deny file-write* (subpath "${root}"))`));
  }
});
