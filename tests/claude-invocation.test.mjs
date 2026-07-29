import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClaudeInvocationArgs,
  CLAUDE_READ_ONLY_TOOLS,
} from "../scripts/claude-invocation.mjs";

test("Claude invocation is universally read-only and fail-closed", () => {
  const args = buildClaudeInvocationArgs({
    model: "opus[1m]",
    effort: "high",
  });
  const text = args.join(" ");

  assert.deepEqual(CLAUDE_READ_ONLY_TOOLS, ["Read", "Glob", "Grep"]);
  assert.equal(args[args.indexOf("--permission-mode") + 1], "plan");
  assert.equal(args[args.indexOf("--tools") + 1], "Read,Glob,Grep");
  assert.equal(args[args.indexOf("--model") + 1], "opus[1m]");
  assert.equal(args[args.indexOf("--effort") + 1], "high");
  assert.doesNotMatch(text, /\bBash\b/);
  assert.doesNotMatch(text, /allowedTools/);
  assert.ok(args.includes("--safe-mode"));
  assert.ok(args.includes("--strict-mcp-config"));
  assert.ok(args.includes("--no-session-persistence"));
});
