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

export function formatLivenessDuration(seconds = 0) {
  const bounded = Math.max(0, Math.floor(Number(seconds) || 0));
  if (bounded < 60) return `${bounded}s`;
  const minutes = Math.floor(bounded / 60);
  const remainder = bounded % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

export function livenessDetailText({
  state = "",
  elapsedSeconds = 0,
  quietSeconds = 0,
} = {}) {
  const elapsed = formatLivenessDuration(elapsedSeconds);
  if (state === "process-active") {
    const quiet = Math.max(0, Math.floor(Number(quietSeconds) || 0));
    return quiet >= 20
      ? `Process active · reasoning ${elapsed} · no output for ${formatLivenessDuration(quiet)}`
      : `Process active · reasoning ${elapsed}`;
  }
  if (state === "process-exited") return `Process exited · collecting the result after ${elapsed}`;
  if (state === "request-active") return `Request active · reasoning ${elapsed}`;
  if (state === "preparing") return `Preparing isolated workspace · ${elapsed}`;
  return "";
}

export function liveStatusText({
  mode = "setup",
  status = "idle",
  speaker = "",
  failedRole = "",
  turn = 0,
  totalTurns = 0,
  lastReplyAuthor = "",
  livenessState = "",
  elapsedSeconds = 0,
  quietSeconds = 0,
  preparationStage = "",
  preparationNote = "",
} = {}) {
  if (mode !== "session") return "";

  const total = Math.max(0, Number(totalTurns) || 0);
  const completed = boundedCount(turn, total);

  if (status === "preparing") {
    const stage = String(preparationStage || "validating-source").replaceAll("-", " ");
    const note = String(preparationNote || "").trim();
    return `Preparing isolated workspaces: ${stage}.${note ? ` ${note}` : ""}`;
  }

  if (status === "running") {
    if (speaker && total) {
      const activity =
        completed < 3
          ? "preparing an independent sealed opening"
          : "cross-examining the revealed positions";
      const liveness = livenessDetailText({
        state: livenessState,
        elapsedSeconds,
        quietSeconds,
      });
      return `Turn ${Math.min(completed + 1, total)} of ${total}: ${agentLabel(speaker)} is ${activity}.${liveness ? ` ${liveness}.` : ""}`;
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
    const synthesizer = speaker ? agentLabel(speaker) : "A participant";
    return `${completed} of ${total} turns complete. ${synthesizer} is preparing or revising the Completion Brief.`;
  }

  if (status === "reviewing") {
    const reviewer = speaker ? agentLabel(speaker) : "A participant";
    return `${reviewer} is independently auditing the Completion Brief.`;
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
