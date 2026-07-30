const AGENT_LABELS = {
  codex: "Codex",
  claude: "Claude",
  antigravity: "Antigravity",
};

function agentLabel(role) {
  return AGENT_LABELS[role] || "The agent";
}

function boundedCount(turn, totalTurns) {
  const total = Math.max(0, Number(totalTurns) || 0);
  return Math.min(total, Math.max(0, Number(turn) || 0));
}

export function liveStatusText({
  mode = "setup",
  status = "idle",
  speaker = "",
  failedRole = "",
  turn = 0,
  totalTurns = 0,
  lastReplyAuthor = "",
} = {}) {
  if (mode !== "session") return "";

  const total = Math.max(0, Number(totalTurns) || 0);
  const completed = boundedCount(turn, total);

  if (status === "running") {
    if (speaker && total) {
      return `Turn ${Math.min(completed + 1, total)} of ${total}: ${agentLabel(speaker)} is reading the room.`;
    }
    if (completed && lastReplyAuthor) {
      return `${lastReplyAuthor} replied. ${completed} of ${total} turns complete.`;
    }
    return "";
  }

  if (status === "failed") {
    return `${agentLabel(failedRole)} could not complete turn ${Math.min(completed + 1, total || completed + 1)}. Retry or end the discussion.`;
  }

  if (status === "retrying") {
    const role = speaker || failedRole;
    return `Retrying turn ${Math.min(completed + 1, total || completed + 1)} with ${agentLabel(role)}.`;
  }

  if (status === "synthesizing") {
    return `${completed} of ${total} turns complete. Codex is preparing the Completion Brief.`;
  }

  if (status === "reviewing") {
    return `${agentLabel(speaker)} is reviewing dissent coverage.`;
  }

  if (status === "complete") {
    return "Discussion complete. The Completion Brief is available.";
  }

  if (status === "stopped") return "Discussion stopped.";
  if (status === "error") return "Discussion ended with an error.";
  if (status === "interrupted") return "Discussion interrupted.";
  return "";
}

export function autoScrollBehavior(reducedMotion) {
  return reducedMotion ? "auto" : "smooth";
}
