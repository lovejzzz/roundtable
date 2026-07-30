import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AGENT_COMMON_ENVIRONMENT_KEYS,
  AGENT_ROLE_ENVIRONMENT_KEYS,
  buildAgentEnvironment,
  classifyAgentAuthenticationFailure,
  withheldAuthenticationVariables,
} from "../scripts/agent-environment.mjs";

test("agent children receive only common and role-scoped environment values", () => {
  const inherited = {
    HOME: "/Users/test",
    PATH: "/usr/bin",
    TMPDIR: "/tmp",
    LANG: "en_US.UTF-8",
    CODEX_HOME: "/Users/test/custom-codex",
    CLAUDE_CONFIG_DIR: "/Users/test/custom-claude",
    OPENAI_API_KEY: "openai-secret",
    ANTHROPIC_API_KEY: "anthropic-secret",
    AWS_SECRET_ACCESS_KEY: "aws-secret",
    DATABASE_URL: "postgres://secret",
    NPM_TOKEN: "npm-secret",
    ROUNDTABLE_BRIDGE_TOKEN: "bridge-secret",
    NODE_OPTIONS: "--require=/tmp/injected.cjs",
  };

  const codex = buildAgentEnvironment("codex", {}, inherited);
  const claude = buildAgentEnvironment("claude", {}, inherited);
  const antigravity = buildAgentEnvironment("antigravity", {}, inherited);
  const broker = buildAgentEnvironment("broker", { HOME: "/tmp/broker-home" }, inherited);

  assert.equal(codex.CODEX_HOME, inherited.CODEX_HOME);
  assert.equal(codex.CLAUDE_CONFIG_DIR, undefined);
  assert.equal(claude.CLAUDE_CONFIG_DIR, inherited.CLAUDE_CONFIG_DIR);
  assert.equal(claude.CODEX_HOME, undefined);
  assert.equal(antigravity.CODEX_HOME, undefined);
  assert.equal(antigravity.CLAUDE_CONFIG_DIR, undefined);
  assert.equal(broker.HOME, "/tmp/broker-home");
  assert.equal(broker.CODEX_HOME, undefined);
  assert.equal(broker.CLAUDE_CONFIG_DIR, undefined);

  for (const environment of [codex, claude, antigravity]) {
    assert.equal(environment.HOME, inherited.HOME);
    assert.equal(environment.PATH, inherited.PATH);
    assert.equal(environment.OPENAI_API_KEY, undefined);
    assert.equal(environment.ANTHROPIC_API_KEY, undefined);
    assert.equal(environment.AWS_SECRET_ACCESS_KEY, undefined);
    assert.equal(environment.DATABASE_URL, undefined);
    assert.equal(environment.NPM_TOKEN, undefined);
    assert.equal(environment.ROUNDTABLE_BRIDGE_TOKEN, undefined);
    assert.equal(environment.NODE_OPTIONS, undefined);
    assert.equal(environment.CI, "1");
    assert.equal(environment.NO_COLOR, "1");
    assert.equal(environment.TERM, "dumb");
  }
});

test("filtering applies after overrides and bridge-controlled values cannot drift", () => {
  const environment = buildAgentEnvironment(
    "codex",
    {
      CODEX_HOME: "/safe/codex",
      CLAUDE_CONFIG_DIR: "/cross-role",
      OPENAI_API_KEY: "override-secret",
      ROUNDTABLE_BRIDGE_TOKEN: "override-bridge-secret",
      CI: "0",
      NO_COLOR: "0",
      TERM: "xterm",
    },
    { HOME: "/Users/test", PATH: "/usr/bin" },
  );

  assert.equal(environment.CODEX_HOME, "/safe/codex");
  assert.equal(environment.CLAUDE_CONFIG_DIR, undefined);
  assert.equal(environment.OPENAI_API_KEY, undefined);
  assert.equal(environment.ROUNDTABLE_BRIDGE_TOKEN, undefined);
  assert.equal(environment.CI, "1");
  assert.equal(environment.NO_COLOR, "1");
  assert.equal(environment.TERM, "dumb");
  assert.deepEqual(AGENT_ROLE_ENVIRONMENT_KEYS.codex, ["CODEX_HOME"]);
  assert.ok(AGENT_COMMON_ENVIRONMENT_KEYS.includes("HOME"));
});

test("reports withheld authentication variable names without retaining values", () => {
  assert.deepEqual(
    withheldAuthenticationVariables({
      OPENAI_API_KEY: "secret",
      ANTHROPIC_API_KEY: "",
      GEMINI_API_KEY: "secret",
      AWS_SECRET_ACCESS_KEY: "secret",
    }),
    ["OPENAI_API_KEY", "GEMINI_API_KEY"],
  );
});

test("classifies authentication failures into persisted-login remediation", () => {
  assert.match(
    classifyAgentAuthenticationFailure("codex", "Error: not logged in"),
    /codex login/,
  );
  assert.match(
    classifyAgentAuthenticationFailure("claude", "Authentication required"),
    /claude auth login/,
  );
  assert.equal(
    classifyAgentAuthenticationFailure("antigravity", "Provider timed out"),
    "",
  );
  assert.throws(() => buildAgentEnvironment("unknown"), /Unknown agent role/);
});

test("bridge probes and managed turns share the role-scoped environment contract", async () => {
  const source = await readFile(
    new URL("../scripts/bridge.mjs", import.meta.url),
    "utf8",
  );
  assert.equal(source.match(/env: agentEnvironment\(role\)/g)?.length, 1);
  assert.equal(
    source.match(/env: environment \|\| agentEnvironment\(environmentRole\)/g)?.length,
    1,
  );
  assert.match(source, /buildAgentEnvironment\("broker", \{ HOME: scratchHome \}\)/);
  assert.match(source, /runSmallCommandResult\(codexPath, \["login", "status"\], "codex"\)/);
  assert.match(source, /runSmallCommandResult\(claudePath, \["auth", "status"\], "claude"\)/);
  assert.match(source, /const codexGuardProbe/);
  assert.match(source, /resolveCredentialPathAliases/);
});
