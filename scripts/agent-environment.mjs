export const AGENT_DENIED_ENVIRONMENT_KEYS = Object.freeze([
  "ROUNDTABLE_BRIDGE_TOKEN",
]);

export function buildAgentEnvironment(
  overrides = {},
  inheritedEnvironment = process.env,
) {
  const environment = {
    ...inheritedEnvironment,
    CI: "1",
    NO_COLOR: "1",
    TERM: "dumb",
    ...overrides,
  };
  for (const key of AGENT_DENIED_ENVIRONMENT_KEYS) delete environment[key];
  return environment;
}
