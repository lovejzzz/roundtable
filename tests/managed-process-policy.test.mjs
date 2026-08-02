import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_AGENT_TURN_TIMEOUT_MS,
  managedProcessTimeoutMessage,
} from "../scripts/managed-process-policy.mjs";

test("agent turns may reason beyond the former ten-minute cutoff", () => {
  assert.equal(DEFAULT_AGENT_TURN_TIMEOUT_MS, 30 * 60 * 1000);
  assert.ok(DEFAULT_AGENT_TURN_TIMEOUT_MS > 10 * 60 * 1000);
});

test("the safety-ceiling error does not misreport a live process as dead", () => {
  assert.equal(
    managedProcessTimeoutMessage(DEFAULT_AGENT_TURN_TIMEOUT_MS),
    "The process reached the 30-minute safety ceiling while it was still running.",
  );
});
