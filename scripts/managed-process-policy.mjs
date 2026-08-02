export const DEFAULT_AGENT_TURN_TIMEOUT_MS = 30 * 60 * 1000;

export function managedProcessTimeoutMessage(timeoutMs) {
  const minutes = Math.ceil(timeoutMs / 60_000);
  return `The process reached the ${minutes}-minute safety ceiling while it was still running.`;
}
