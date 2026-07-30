import assert from "node:assert/strict";
import test from "node:test";
import {
  ANTIGRAVITY_REQUIRED_FLAGS,
  buildAntigravityInvocationArgs,
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

test("falls back to medium effort and keeps an empty model on the CLI default", () => {
  const args = buildAntigravityInvocationArgs({
    effort: "unsupported",
    prompt: "Review this.",
  });

  assert.equal(args.includes("--model"), false);
  assert.deepEqual(args.slice(-4), ["--effort", "medium", "--print", "Review this."]);
});
