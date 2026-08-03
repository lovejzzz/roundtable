const AGENT_ROLES = new Set(["codex", "claude", "antigravity", "broker"]);

export const AGENT_COMMON_ENVIRONMENT_KEYS = Object.freeze([
  "HOME",
  "PATH",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LANGUAGE",
  "LC_ALL",
  "LC_CTYPE",
  "SHELL",
  "USER",
  "LOGNAME",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
  "LOCALAPPDATA",
  "APPDATA",
  "USERPROFILE",
  "PROGRAMDATA",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "NODE_EXTRA_CA_CERTS",
]);

export const AGENT_ROLE_ENVIRONMENT_KEYS = Object.freeze({
  codex: Object.freeze(["CODEX_HOME"]),
  claude: Object.freeze(["CLAUDE_CONFIG_DIR"]),
  antigravity: Object.freeze([]),
  broker: Object.freeze([]),
});

export const AGENT_AUTHENTICATION_ENVIRONMENT_KEYS = Object.freeze([
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
  "CODEX_ACCESS_TOKEN",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "GOOGLE_API_KEY",
  "GEMINI_API_KEY",
]);

export function withheldAuthenticationVariables(
  inheritedEnvironment = process.env,
) {
  return AGENT_AUTHENTICATION_ENVIRONMENT_KEYS.filter(
    (key) => typeof inheritedEnvironment[key] === "string" && inheritedEnvironment[key].length > 0,
  );
}

export function buildAgentEnvironment(
  role,
  overrides = {},
  inheritedEnvironment = process.env,
) {
  if (!AGENT_ROLES.has(role)) {
    throw new Error(`Unknown agent role: ${role || "(empty)"}`);
  }
  const candidates = { ...inheritedEnvironment, ...overrides };
  const environment = {};
  for (const key of [
    ...AGENT_COMMON_ENVIRONMENT_KEYS,
    ...AGENT_ROLE_ENVIRONMENT_KEYS[role],
  ]) {
    if (typeof candidates[key] === "string") environment[key] = candidates[key];
  }
  return {
    ...environment,
    CI: "1",
    NO_COLOR: "1",
    TERM: "dumb",
  };
}

export function classifyAgentAuthenticationFailure(role, message) {
  const raw = String(message || "");
  const persistedSessionRejected =
    /\b(?:oauth\s+)?(?:access\s+)?token\b.{0,80}\b(?:revoked|expired|invalid)\b/i.test(raw) ||
    /\b(?:revoked|expired|invalid)\b.{0,80}\b(?:oauth\s+)?(?:access\s+)?token\b/i.test(raw);
  if (
    !persistedSessionRejected &&
    !/(?:not logged in|not authenticated|authentication (?:failed|required)|unauthorized|login required|please (?:run|use).{0,30}login|api key.{0,30}(?:missing|required|invalid)|invalid api key)/i.test(
      raw,
    )
  ) {
    return "";
  }
  const instructions = {
    codex: "Run `codex login` in a terminal",
    antigravity: "Open `agy` in a terminal and complete sign-in",
  };
  const statusBoundary = persistedSessionRejected
    ? " The provider rejected the persisted session; a local CLI status check can still report logged in after server-side revocation or expiry."
    : "";
  if (role === "claude") {
    return `Claude authentication became unavailable, so Roundtable will skip Claude for the rest of this room and continue with the available participants.${statusBoundary} Claude will be rechecked automatically before the next discussion.`;
  }
  return `${instructions[role] || "Sign in to the CLI"}, then retry this turn.${statusBoundary} Roundtable requires persisted CLI sign-in and does not pass ambient API credentials to agents.`;
}
