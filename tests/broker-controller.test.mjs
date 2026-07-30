import assert from "node:assert/strict";
import test from "node:test";
import { runBrokerCapableParticipant } from "../scripts/broker-controller.mjs";

const draftWithRequest = `A focused check should settle this.
\`\`\`roundtable-test-request
{"version":1,"argv":["npm","test"]}
\`\`\``;

test("retries a failed follow-up from the saved broker result without re-executing", async () => {
  const session = { completedTurns: 1 };
  let executions = 0;
  let invocations = 0;
  const invoke = async (prompt) => {
    invocations += 1;
    if (invocations === 1) return draftWithRequest;
    assert.match(prompt, /BROKERED CHECK RESULT/);
    assert.match(prompt, /Exit code: 0/);
    if (invocations === 2) throw new Error("transient follow-up failure");
    return "The saved passing result supports the recommendation.";
  };
  const execute = async () => {
    executions += 1;
    return {
      result: { status: "passed", exitCode: 0, stdout: "all passed", stderr: "" },
      sandboxPaths: ["/tmp/request-copy"],
    };
  };
  const request = {
    session,
    role: "claude",
    prompt: "Audit this change.",
    invoke,
    execute,
    participantSandboxPaths: ["/tmp/claude-copy"],
  };

  await assert.rejects(runBrokerCapableParticipant(request), /transient follow-up failure/);
  const reply = await runBrokerCapableParticipant(request);

  assert.equal(executions, 1);
  assert.equal(invocations, 3);
  assert.equal(reply.text, "The saved passing result supports the recommendation.");
  assert.equal(reply.checks[0].provenance, "bridge-broker");
});

test("rebuilds a drifted follow-up prompt from the checkpoint without rerunning", async () => {
  const session = { completedTurns: 4 };
  let executions = 0;
  let invocations = 0;
  const invoke = async (prompt) => {
    invocations += 1;
    if (invocations === 1) return draftWithRequest;
    if (invocations === 2) throw new Error("follow-up unavailable");
    assert.match(prompt, /Updated steering context/);
    return "The saved result still applies to the updated context.";
  };
  const execute = async () => {
    executions += 1;
    return {
      result: { status: "passed", exitCode: 0, stdout: "ok", stderr: "" },
      sandboxPaths: [],
    };
  };

  await assert.rejects(
    runBrokerCapableParticipant({
      session,
      role: "antigravity",
      prompt: "Original context",
      invoke,
      execute,
    }),
    /follow-up unavailable/,
  );
  const reply = await runBrokerCapableParticipant({
    session,
    role: "antigravity",
    prompt: "Updated steering context",
    invoke,
    execute,
  });

  assert.equal(executions, 1);
  assert.equal(reply.text, "The saved result still applies to the updated context.");
});

test("rejects empty or request-bearing broker follow-ups", async () => {
  for (const invalidFollowUp of ["", draftWithRequest]) {
    const session = { completedTurns: 0 };
    let invocation = 0;
    await assert.rejects(
      runBrokerCapableParticipant({
        session,
        role: "claude",
        prompt: "Audit",
        invoke: async () => (++invocation === 1 ? draftWithRequest : invalidFollowUp),
        execute: async () => ({
          result: { status: "passed", exitCode: 0 },
          sandboxPaths: [],
        }),
      }),
      /no final contribution|another command/i,
    );
  }
});
