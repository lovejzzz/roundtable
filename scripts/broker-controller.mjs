import {
  buildBrokerResultPrompt,
  extractTestRequest,
  makeBrokerCheck,
  sanitizeBrokerResult,
} from "./test-broker.mjs";

export function isApprovalSeekingPlanOnlyReply(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  return [
    /please\s+review\s+(?:the\s+)?(?:implementation\s+)?plan/i,
    /let\s+me\s+know\s+if\s+you\s+(?:approve|want\s+me\s+to\s+proceed)/i,
    /(?:awaiting|wait(?:ing)?)\s+(?:your\s+)?approval/i,
    /approve\s+(?:this|the)\s+(?:implementation\s+)?plan/i,
  ].some((pattern) => pattern.test(text));
}

function substantiveRetryPrompt(prompt) {
  return `${prompt}

TURN COMPLETION CORRECTION
Your previous draft stopped at an approval request or implementation plan. This is a discussion
turn, not an approval gate. Inspect the repository now and provide the substantive audit,
challenge, or recommendation requested by YOUR TURN. Do not ask permission to proceed and do not
refer the room to a separate plan file.`;
}

export async function runBrokerCapableParticipant({
  session,
  role,
  prompt,
  purpose,
  invoke,
  execute,
  onBrokerStart,
  onBrokerEnd,
  participantSandboxPaths = [],
}) {
  if (purpose) return invoke(prompt);
  session.brokerTransactions ||= new Map();
  const transactionKey = `${role}:${session.completedTurns || 0}`;
  const expectedAttachmentManifestId = session.attachmentManifestId || "";
  let transaction = session.brokerTransactions.get(transactionKey);

  if (!transaction) {
    let firstReply = await invoke(prompt);
    if (role === "antigravity" && isApprovalSeekingPlanOnlyReply(firstReply)) {
      firstReply = await invoke(substantiveRetryPrompt(prompt));
      if (isApprovalSeekingPlanOnlyReply(firstReply)) {
        throw new Error("Antigravity returned an approval-seeking plan instead of a substantive discussion turn.");
      }
    }
    const parsed = extractTestRequest(firstReply);
    if (!parsed.request) return firstReply;
    let brokerExecution;
    if (parsed.request.error) {
      brokerExecution = {
        result: { status: "blocked", error: parsed.request.error },
        sandboxPaths: [],
      };
    } else {
      onBrokerStart?.(parsed.request.argv);
      try {
        brokerExecution = await execute(parsed.request.argv);
      } finally {
        onBrokerEnd?.();
      }
    }
    const executedAttachmentManifestId =
      brokerExecution.attachmentManifestId || "";
    if (
      !parsed.request.error &&
      executedAttachmentManifestId !== expectedAttachmentManifestId &&
      !(
        brokerExecution.result?.status === "blocked" &&
        !executedAttachmentManifestId
      )
    ) {
      throw new Error("The broker attachment manifest did not match the active discussion.");
    }
    const round = Math.floor((session.completedTurns || 0) / 3) + 1;
    const sandboxPaths = [
      ...participantSandboxPaths,
      ...brokerExecution.sandboxPaths,
    ].filter(Boolean);
    const savedResult = sanitizeBrokerResult(brokerExecution.result, sandboxPaths);
    transaction = {
      originalPrompt: prompt,
      argv: parsed.request.argv,
      result: savedResult,
      sandboxPaths,
      attachmentManifestId: expectedAttachmentManifestId,
      check: makeBrokerCheck(parsed.request.argv, savedResult, round, {
        attachmentManifestId: executedAttachmentManifestId,
      }),
    };
    session.brokerTransactions.set(transactionKey, transaction);
  } else if (transaction.attachmentManifestId !== expectedAttachmentManifestId) {
    throw new Error("The saved broker result belongs to a different attachment manifest.");
  } else if (transaction.originalPrompt !== prompt) {
    transaction.originalPrompt = prompt;
  }

  const resultPrompt = buildBrokerResultPrompt({
    originalPrompt: transaction.originalPrompt,
    argv: transaction.argv,
    result: transaction.result,
    sandboxPaths: transaction.sandboxPaths,
  });
  const finalReply = await invoke(resultPrompt);
  const finalParsed = extractTestRequest(finalReply);
  if (finalParsed.request) {
    throw new Error("The broker follow-up requested another command; only one is allowed per turn.");
  }
  if (!finalParsed.body) {
    throw new Error("The broker follow-up returned no final contribution.");
  }
  return {
    text: finalParsed.body,
    checks: [transaction.check],
  };
}
