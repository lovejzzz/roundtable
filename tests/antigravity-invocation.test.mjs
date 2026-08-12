import assert from "node:assert/strict";
import test from "node:test";
import {
  ANTIGRAVITY_REQUIRED_FLAGS,
  antigravityModelEffort,
  buildAntigravityInvocationArgs,
  parseAntigravityModels,
} from "../scripts/antigravity-invocation.mjs";

test("builds a plan-mode sandboxed Antigravity print invocation", () => {
  const args = buildAntigravityInvocationArgs({
    model: "gemini-3.6-flash-high",
    effort: "high",
    prompt: "Discuss the project.",
  });

  assert.deepEqual(args, [
    "--output-format",
    "text",
    "--mode",
    "plan",
    "--sandbox",
    "--dangerously-skip-permissions",
    "--print-timeout",
    "9m",
    "--model",
    "gemini-3.6-flash-high",
    "--effort",
    "high",
    "--print",
    "Discuss the project.",
  ]);
  for (const flag of ANTIGRAVITY_REQUIRED_FLAGS) {
    assert.ok(args.includes(flag), `${flag} should be represented in the invocation`);
  }
});

test("extracts an encoded model effort and rejects contradictory routing", () => {
  assert.equal(antigravityModelEffort("gemini-3.6-flash-high"), "high");
  assert.equal(antigravityModelEffort("claude-opus-4-6-thinking"), "");
  assert.throws(
    () =>
      buildAntigravityInvocationArgs({
        model: "gemini-3.6-flash-high",
        effort: "medium",
        prompt: "Review this.",
      }),
    /requires high reasoning effort/,
  );
});

test("falls back to high effort and keeps an empty model on the CLI default", () => {
  const args = buildAntigravityInvocationArgs({
    effort: "unsupported",
    prompt: "Review this.",
  });

  assert.equal(args.includes("--model"), false);
  assert.deepEqual(args.slice(-4), ["--effort", "high", "--print", "Review this."]);
});

test("parses current Antigravity model listings with display labels", () => {
  assert.deepEqual(
    parseAntigravityModels(`Fetching available models...\n\
gemini-3.6-flash-high\tGemini 3.6 Flash (High)\n\
gemini-3.1-pro-low Gemini 3.1 Pro (Low)\n\
claude-opus-4-6-thinking\tClaude Opus 4.6 (Thinking)`),
    ["gemini-3.6-flash-high", "gemini-3.1-pro-low", "claude-opus-4-6-thinking"],
  );
});
