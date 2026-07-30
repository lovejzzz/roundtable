const SUPPORTED_EFFORTS = new Set(["low", "medium", "high"]);
export const ANTIGRAVITY_REQUIRED_FLAGS = Object.freeze([
  "--print",
  "--output-format",
  "--model",
  "--effort",
  "--mode",
  "--sandbox",
  "--dangerously-skip-permissions",
  "--print-timeout",
]);

export function antigravityModelEffort(model = "") {
  return String(model).toLowerCase().match(/-(low|medium|high)$/)?.[1] || "";
}

export function buildAntigravityInvocationArgs({ model = "", effort = "medium", prompt = "" } = {}) {
  const normalizedEffort = SUPPORTED_EFFORTS.has(effort) ? effort : "medium";
  const encodedEffort = antigravityModelEffort(model);
  if (encodedEffort && encodedEffort !== normalizedEffort) {
    throw new Error(
      `Antigravity model ${model} requires ${encodedEffort} reasoning effort.`,
    );
  }
  const args = [
    "--output-format",
    "text",
    "--mode",
    "plan",
    "--sandbox",
    "--dangerously-skip-permissions",
    "--print-timeout",
    "9m",
  ];
  if (model) args.push("--model", model);
  args.push("--effort", normalizedEffort, "--print", prompt);
  return args;
}
