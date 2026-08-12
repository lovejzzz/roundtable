import { createHash } from "node:crypto";

import { normalizePromptAttachments } from "./prompt-attachments.mjs";

function attachmentDescriptors(normalizedAttachments) {
  return normalizedAttachments.payloads.map((attachment) => ({
    name: attachment.name,
    mediaType: attachment.mediaType,
    size: attachment.size,
    path: attachment.path,
    sha256: attachment.sha256,
    ...(attachment.expandedPath
      ? { expandedPath: attachment.expandedPath }
      : {}),
  }));
}

export function canonicalReviewConfiguration(
  payload,
  normalizedAttachments = normalizePromptAttachments(payload?.attachments),
) {
  return {
    projectPath: String(payload?.projectPath || ""),
    topic: String(payload?.topic || ""),
    attachments: attachmentDescriptors(normalizedAttachments),
    attachmentManifestId: normalizedAttachments.attachmentManifestId,
    rounds: Number(payload?.rounds),
    codexModel: String(payload?.codexModel || ""),
    claudeModel: String(payload?.claudeModel || ""),
    antigravityModel: String(payload?.antigravityModel || ""),
    fableModel: String(payload?.fableModel || ""),
    codexEffort: String(payload?.codexEffort || ""),
    claudeEffort: String(payload?.claudeEffort || ""),
    antigravityEffort: String(payload?.antigravityEffort || ""),
    fableEffort: String(payload?.fableEffort || ""),
    fableFinalAudit: Boolean(payload?.fableFinalAudit),
    keepHistory: Boolean(payload?.keepHistory),
    reviewDissent: Boolean(payload?.reviewDissent),
  };
}

export function reviewConfigurationSha256(
  payload,
  normalizedAttachments,
) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonicalReviewConfiguration(payload, normalizedAttachments),
      ),
      "utf8",
    )
    .digest("hex");
}
