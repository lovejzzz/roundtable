import assert from "node:assert/strict";
import test from "node:test";
import {
  autoScrollBehavior,
  formatLivenessDuration,
  livenessDetailText,
  liveStatusText,
  pendingSteeringPresentation,
} from "../lib/live-status.mjs";

test("announces the active agent with one-based turn wording", () => {
  assert.equal(
    liveStatusText({
      mode: "session",
      status: "running",
      speaker: "codex",
      turn: 0,
      totalTurns: 6,
    }),
    "Turn 1 of 6: Codex is preparing an independent sealed opening.",
  );
  assert.equal(
    liveStatusText({
      mode: "session",
      status: "running",
      speaker: "claude",
      turn: 1,
      totalTurns: 6,
    }),
    "Turn 2 of 6: Claude is preparing an independent sealed opening.",
  );
  assert.equal(
    liveStatusText({
      mode: "session",
      status: "running",
      speaker: "codex",
      turn: 3,
      totalTurns: 6,
    }),
    "Turn 4 of 6: Codex is cross-examining the revealed positions.",
  );
});

test("announces a reply using the bridge completed-turn count", () => {
  assert.equal(
    liveStatusText({
      mode: "session",
      status: "running",
      turn: 2,
      totalTurns: 6,
      lastReplyAuthor: "Claude",
    }),
    "Claude replied. 2 of 6 turns complete.",
  );
});

test("announces truthful workspace preparation without invented progress", () => {
  assert.equal(
    liveStatusText({
      mode: "session",
      status: "preparing",
      preparationStage: "cloning-role",
      preparationNote: "Cloning the validated source for Claude.",
      totalTurns: 6,
    }),
    "Preparing isolated workspaces: cloning role. Cloning the validated source for Claude.",
  );
});

test("distinguishes active long reasoning from a dead process", () => {
  assert.equal(formatLivenessDuration(0), "0s");
  assert.equal(formatLivenessDuration(79), "1m 19s");
  assert.equal(
    livenessDetailText({
      state: "process-active",
      elapsedSeconds: 154,
      quietSeconds: 91,
    }),
    "Process active · reasoning 2m 34s · no output for 1m 31s",
  );
  assert.equal(
    liveStatusText({
      mode: "session",
      status: "running",
      speaker: "claude",
      turn: 3,
      totalTurns: 6,
      livenessState: "process-active",
      elapsedSeconds: 154,
      quietSeconds: 91,
    }),
    "Turn 4 of 6: Claude is cross-examining the revealed positions. Process active · reasoning 2m 34s · no output for 1m 31s.",
  );
  assert.equal(
    livenessDetailText({
      state: "process-exited",
      elapsedSeconds: 155,
    }),
    "Process exited · collecting the result after 2m 35s",
  );
});

test("keeps initial, setup, and archived states silent", () => {
  assert.equal(
    liveStatusText({
      mode: "session",
      status: "running",
      turn: 0,
      totalTurns: 6,
    }),
    "",
  );
  assert.equal(
    liveStatusText({
      mode: "setup",
      status: "running",
      speaker: "codex",
      totalTurns: 6,
    }),
    "",
  );
  assert.equal(
    liveStatusText({
      mode: "archive",
      status: "complete",
      turn: 6,
      totalTurns: 6,
    }),
    "",
  );
});

test("announces failed and retried turns without leaking failure details", () => {
  assert.equal(
    liveStatusText({
      mode: "session",
      status: "failed",
      failedRole: "antigravity",
      turn: 2,
      totalTurns: 6,
    }),
    "Antigravity could not complete turn 3. Retry or end the discussion.",
  );
  assert.equal(
    liveStatusText({
      mode: "session",
      status: "retrying",
      speaker: "antigravity",
      turn: 2,
      totalTurns: 6,
    }),
    "Retrying turn 3 with Antigravity.",
  );
});

test("announces synthesis, dissent review, and terminal states", () => {
  assert.equal(
    liveStatusText({
      mode: "session",
      status: "synthesizing",
      turn: 6,
      totalTurns: 6,
    }),
    "6 of 6 turns complete. A participant is preparing or revising the Completion Brief.",
  );
  assert.equal(
    liveStatusText({
      mode: "session",
      status: "reviewing",
      speaker: "claude",
      turn: 6,
      totalTurns: 6,
    }),
    "Claude is independently auditing the Completion Brief.",
  );
  assert.equal(liveStatusText({ mode: "session", status: "complete" }), "Discussion complete. The Completion Brief is available.");
  assert.equal(liveStatusText({ mode: "session", status: "stopped" }), "Discussion stopped.");
  assert.equal(liveStatusText({ mode: "session", status: "error" }), "Discussion ended with an error.");
  assert.equal(liveStatusText({ mode: "session", status: "interrupted" }), "Discussion interrupted.");
});

test("derives identical text for an identical recovered snapshot", () => {
  const snapshot = {
    mode: "session",
    status: "running",
    speaker: "antigravity",
    turn: 2,
    totalTurns: 6,
    lastReplyAuthor: "Claude",
  };
  assert.equal(liveStatusText(snapshot), liveStatusText(structuredClone(snapshot)));
});

test("uses instant auto-scroll when reduced motion is requested", () => {
  assert.equal(autoScrollBehavior(true), "auto");
  assert.equal(autoScrollBehavior(false), "smooth");
});

test("describes queued steering truthfully before and after a room ends", () => {
  assert.deepEqual(pendingSteeringPresentation(), {
    title: "Queued for the next agent turn",
    description:
      "These notes are waiting for the next eligible agent turn and are not part of the shared transcript yet.",
    transcriptDescription:
      "These steering notes are queued for delivery and are not part of the shared transcript yet.",
  });
  assert.equal(
    pendingSteeringPresentation({ terminal: true }).title,
    "Queued, never delivered",
  );
  assert.equal(
    pendingSteeringPresentation({ archived: true }).title,
    "Queued, never delivered",
  );
});
