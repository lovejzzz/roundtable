import assert from "node:assert/strict";
import test from "node:test";
import {
  RecoveryHttpError,
  ownsSessionGeneration,
  recoveryDelayMs,
  recoveryFailureKind,
} from "../lib/stream-recovery.mjs";

test("uses capped retry delays for transient recovery failures", () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 20].map((attempt) => recoveryDelayMs(attempt)),
    [900, 2_000, 5_000, 10_000, 10_000, 10_000],
  );
  assert.equal(recoveryDelayMs(-4), 900);
  assert.equal(recoveryDelayMs(Number.NaN), 900);
});

test("distinguishes missing and authorization responses from transient failures", () => {
  assert.equal(recoveryFailureKind(404), "missing");
  assert.equal(recoveryFailureKind(401), "authorization");
  assert.equal(recoveryFailureKind(403), "authorization");
  assert.equal(recoveryFailureKind(408), "transient");
  assert.equal(recoveryFailureKind(500), "transient");
  assert.equal(recoveryFailureKind(), "transient");
});

test("retains HTTP status on recovery errors without response bodies", () => {
  const error = new RecoveryHttpError(503, "The discussion could not be restored.");
  assert.equal(error.name, "RecoveryHttpError");
  assert.equal(error.status, 503);
  assert.equal(recoveryFailureKind(error.status), "transient");
});

test("accepts results only for the current generation and session", () => {
  const current = {
    expectedGeneration: 4,
    currentGeneration: 4,
    expectedSessionId: "session-b",
    currentSessionId: "session-b",
  };
  assert.equal(ownsSessionGeneration(current), true);
  assert.equal(
    ownsSessionGeneration({ ...current, currentGeneration: 5 }),
    false,
  );
  assert.equal(
    ownsSessionGeneration({ ...current, currentSessionId: "session-c" }),
    false,
  );
  assert.equal(
    ownsSessionGeneration({ ...current, expectedSessionId: "" }),
    false,
  );
});
