import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_DENIED_ENVIRONMENT_KEYS,
  buildAgentEnvironment,
} from "../scripts/agent-environment.mjs";

test("agent children never inherit the bridge credential", () => {
  const environment = buildAgentEnvironment(
    {
      ROUNDTABLE_BRIDGE_TOKEN: "override-must-also-be-removed",
      AGENT_SETTING: "allowed",
    },
    {
      PATH: "/usr/bin",
      ROUNDTABLE_BRIDGE_TOKEN: "bridge-secret",
      USER_SETTING: "preserved",
    },
  );

  assert.deepEqual(AGENT_DENIED_ENVIRONMENT_KEYS, ["ROUNDTABLE_BRIDGE_TOKEN"]);
  assert.equal(environment.ROUNDTABLE_BRIDGE_TOKEN, undefined);
  assert.equal(environment.PATH, "/usr/bin");
  assert.equal(environment.USER_SETTING, "preserved");
  assert.equal(environment.AGENT_SETTING, "allowed");
  assert.equal(environment.CI, "1");
  assert.equal(environment.NO_COLOR, "1");
  assert.equal(environment.TERM, "dumb");
});
