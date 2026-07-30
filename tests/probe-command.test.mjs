import assert from "node:assert/strict";
import test from "node:test";
import {
  availabilityDiagnostic,
  firstProbeFailureDiagnostic,
  probeFailureDiagnostic,
  runBoundedProbe,
} from "../scripts/probe-command.mjs";

function runNode(source, options = {}) {
  return runBoundedProbe({
    command: process.execPath,
    args: ["-e", source],
    ...options,
  });
}

test("preserves output and ordinary nonzero exit semantics", async () => {
  const success = await runNode(
    'process.stdout.write("first"); process.stderr.write(" second")',
  );
  assert.equal(success.success, true);
  assert.equal(success.reason, "");
  assert.match(success.output, /first/);
  assert.match(success.output, /second/);

  const nonzero = await runNode('process.stdout.write("login required"); process.exit(7)');
  assert.equal(nonzero.success, false);
  assert.equal(nonzero.reason, "");
  assert.equal(nonzero.output, "login required");
});

test("times out a probe and returns no captured output", async () => {
  const result = await runNode(
    'process.stdout.write("fixture-secret"); setInterval(() => {}, 1_000)',
    { timeoutMs: 30, terminationGraceMs: 20 },
  );

  assert.deepEqual(result, {
    output: "",
    success: false,
    reason: "timed_out",
  });
});

test("enforces one combined stdout and stderr byte limit", async () => {
  const result = await runNode(
    'process.stdout.write("12345678"); process.stderr.write("abcdefgh")',
    { maxOutputBytes: 12, timeoutMs: 1_000, terminationGraceMs: 20 },
  );

  assert.deepEqual(result, {
    output: "",
    success: false,
    reason: "output_limit",
  });
});

test("escalates a TERM-resistant probe to SIGKILL", async () => {
  const startedAt = Date.now();
  const result = await runNode(
    'process.on("SIGTERM", () => {}); process.stdout.write("ready"); setInterval(() => {}, 1_000)',
    { timeoutMs: 80, terminationGraceMs: 30 },
  );

  assert.equal(result.reason, "timed_out");
  assert.ok(Date.now() - startedAt >= 100);
  assert.ok(Date.now() - startedAt < 1_000);
});

test("bounds concurrent probes independently", async () => {
  const [quick, hanging] = await Promise.all([
    runNode('process.stdout.write("quick")', { timeoutMs: 200 }),
    runNode("setInterval(() => {}, 1_000)", {
      timeoutMs: 30,
      terminationGraceMs: 20,
    }),
  ]);

  assert.equal(quick.success, true);
  assert.equal(quick.output, "quick");
  assert.equal(hanging.reason, "timed_out");
});

test("diagnostics are fixed and never include captured command output", () => {
  const secret = "fixture-secret";
  const timeout = probeFailureDiagnostic("Claude authentication probe", "timed_out", {
    timeoutMs: 15_000,
  });
  const overflow = probeFailureDiagnostic("Codex capability probe", "output_limit", {
    maxOutputBytes: 65_536,
  });
  const spawn = probeFailureDiagnostic("Antigravity model-access probe", "spawn_failed");

  assert.equal(timeout, "Claude authentication probe timed out after 15 seconds.");
  assert.equal(overflow, "Codex capability probe exceeded the 64 KiB output limit.");
  assert.equal(spawn, "Antigravity model-access probe could not start.");
  assert.ok(!`${timeout}${overflow}${spawn}`.includes(secret));
  assert.equal(probeFailureDiagnostic("Probe", ""), "");
});

test("infrastructure failures precede derived compatibility and authentication states", () => {
  const failure = firstProbeFailureDiagnostic([
    ["Claude capability probe", { reason: "timed_out" }],
    ["Claude authentication probe", { reason: "output_limit" }],
  ]);

  assert.equal(
    availabilityDiagnostic({
      label: "Claude CLI",
      path: "/usr/local/bin/claude",
      probeFailure: failure,
      compatible: false,
      authenticated: false,
      login: "claude auth login",
    }),
    "Claude capability probe timed out after 15 seconds.",
  );
  assert.match(
    availabilityDiagnostic({
      label: "Claude CLI",
      path: "",
      probeFailure: failure,
      compatible: false,
      authenticated: false,
      login: "claude auth login",
    }),
    /not installed/,
  );
  assert.match(
    availabilityDiagnostic({
      label: "Claude CLI",
      path: "/usr/local/bin/claude",
      probeFailure: "",
      compatible: true,
      authenticated: false,
      login: "claude auth login",
    }),
    /claude auth login/,
  );
});

test("supports a bounded success probe with ignored output", async () => {
  const result = await runNode('process.stdout.write("ignored")', {
    captureOutput: false,
    timeoutMs: 200,
  });

  assert.deepEqual(result, { output: "", success: true, reason: "" });
});
