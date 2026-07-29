export const CLAUDE_READ_ONLY_TOOLS = Object.freeze(["Read", "Glob", "Grep"]);

export function buildClaudeInvocationArgs({ model = "", effort = "" } = {}) {
  const args = [
    "--print",
    "--output-format",
    "text",
    "--permission-mode",
    "plan",
    "--no-session-persistence",
    "--no-chrome",
    "--safe-mode",
    "--strict-mcp-config",
    "--tools",
    CLAUDE_READ_ONLY_TOOLS.join(","),
  ];
  if (model) args.push("--model", model);
  if (effort) args.push("--effort", effort);
  return args;
}
