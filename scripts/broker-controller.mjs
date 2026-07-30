import {
  buildBrokerResultPrompt,
  extractTestRequest,
  makeBrokerCheck,
  sanitizeBrokerResult,
} from "./test-broker.mjs";

export async function runBrokerCapableParticipant({
  session,
  role,
  prompt,
  purpose,
  invoke,
  execute,
  participantSandboxPaths = [],
}) {
  if (purpose) return invoke(prompt);
  session.brokerTransactions ||= new Map();
  const transactionKey = `${role}:${session.completedTurns || 0}`;
  const expectedAttachmentManifestId = session.attachmentManifestId || "";
  let transaction = session.brokerTransactions.get(transactionKey);

  if (!transaction) {
    const firstReply = await invoke(prompt);
    const parsed = extractTestRequest(firstReply);
    if (!parsed.request) return firstReply;
    const brokerExecution = parsed.request.error
      ? {
          result: { status: "blocked", error: parsed.request.error },
          sandboxPaths: [],
        }
      : await execute(parsed.request.argv);
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
