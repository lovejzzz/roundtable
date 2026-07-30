const RECOVERY_DELAYS_MS = Object.freeze([900, 2_000, 5_000, 10_000]);

export class RecoveryHttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "RecoveryHttpError";
    this.status = Number(status) || 0;
  }
}

export function recoveryDelayMs(attempt = 0) {
  const normalizedAttempt = Math.max(0, Math.floor(Number(attempt) || 0));
  return RECOVERY_DELAYS_MS[
    Math.min(normalizedAttempt, RECOVERY_DELAYS_MS.length - 1)
  ];
}

export function recoveryFailureKind(status = 0) {
  const normalizedStatus = Number(status) || 0;
  if (normalizedStatus === 404) return "missing";
  if (normalizedStatus === 401 || normalizedStatus === 403) return "authorization";
  return "transient";
}

export function ownsSessionGeneration({
  expectedGeneration,
  currentGeneration,
  expectedSessionId,
  currentSessionId,
} = {}) {
  return Boolean(
    expectedSessionId &&
      expectedSessionId === currentSessionId &&
      expectedGeneration === currentGeneration,
  );
}
