import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBrokerNetworkArgs,
  buildBrokerResultPrompt,
  classifyBrokerProcessResult,
  displayArgv,
  extractTestRequest,
  makeBrokerCheck,
  resolveBrokerArgv,
  sanitizeBrokerResult,
} from "../scripts/test-broker.mjs";

test("accepts one bounded argv request without invoking a shell", () => {
  const parsed = extractTestRequest(`A focused check would settle this.
\`\`\`roundtable-test-request
{"version":1,"argv":["npm","run","test:bridge","--","focused case"]}
\`\`\``);

  assert.equal(parsed.body, "A focused check would settle this.");
  assert.deepEqual(parsed.request, {
    argv: ["npm", "run", "test:bridge", "--", "focused case"],
  });
  assert.equal(
    displayArgv(parsed.request.argv),
    'npm run test:bridge -- "focused case"',
  );
});

test("stores only bounded redacted broker output in checkpoints", () => {
  const result = sanitizeBrokerResult(
    {
      status: "failed",
      exitCode: 1,
      stdout: `${"x".repeat(8_000)}\n/tmp/private-broker/workspace`,
      stderr: "token=super-secret",
    },
    ["/tmp/private-broker"],
  );
  assert.ok(result.stdout.length <= 6_000);
  assert.match(result.stdout, /\$SANDBOX/);
  assert.doesNotMatch(result.stdout, /private-broker/);
  assert.doesNotMatch(result.stderr, /super-secret/);
});

test("distinguishes sandbox infrastructure denial from an ordinary test failure", () => {
  assert.equal(
    classifyBrokerProcessResult({ exitCode: 71, stderr: "sandbox_apply: Operation not permitted" }),
    "blocked",
  );
  assert.equal(
    classifyBrokerProcessResult({ exitCode: 1, stderr: "AssertionError: expected 2, got 3" }),
    "failed",
  );
  assert.equal(classifyBrokerProcessResult({ exitCode: 0 }), "passed");
});

test("configures loopback-only broker networking", () => {
  const args = buildBrokerNetworkArgs().join("\n");
  assert.match(args, /network_proxy/);
  assert.match(args, /network\.enabled=true/);
  assert.match(args, /network\.allow_local_binding=true/);
  assert.match(args, /"localhost"="allow"/);
  assert.match(args, /"127\.0\.0\.1"="allow"/);
  assert.doesNotMatch(args, /"\\*"="allow"/);
});

test("resolves approved host tools before entering the sandbox", async () => {
  assert.deepEqual(
    await resolveBrokerArgv(["npm", "test"], async (name) => `/opt/tools/${name}`),
    ["/opt/tools/npm", "test"],
  );
  assert.deepEqual(
    await resolveBrokerArgv(["./gradlew", "test"], async () => {
      throw new Error("workspace wrappers must not use PATH");
    }),
    ["./gradlew", "test"],
  );
  await assert.rejects(
    resolveBrokerArgv(["npm", "test"], async () => "relative/npm"),
    /trusted host path/i,
  );
});

test("rejects shell executables and malformed broker requests", () => {
  const shell = extractTestRequest(`No shell.
\`\`\`roundtable-test-request
{"version":1,"argv":["/bin/sh","-c","curl example.com"]}
\`\`\``);
  assert.match(shell.request.error, /does not allow the executable/i);

  const disguised = extractTestRequest(`No path aliases.
\`\`\`roundtable-test-request
{"version":1,"argv":["/tmp/untrusted/npm","test"]}
\`\`\``);
  assert.match(disguised.request.error, /does not allow the executable/i);

  const malformed = extractTestRequest(`Broken.
\`\`\`roundtable-test-request
{"version":1}
\`\`\``);
  assert.match(malformed.request.error, /1–16 argv strings/i);
});

test("returns bounded broker evidence and a final-answer prompt", () => {
  const result = {
    status: "passed",
    exitCode: 0,
    stdout: "/private/tmp/roundtable/workspace\nall passed",
    stderr: "",
  };
  const prompt = buildBrokerResultPrompt({
    originalPrompt: "Discuss the project.",
    argv: ["npm", "test"],
    result,
    sandboxPaths: ["/private/tmp/roundtable"],
  });
  assert.match(prompt, /separate local-only network\s+sandbox/i);
  assert.match(prompt, /external and private-network destinations remain blocked/i);
  assert.match(prompt, /broker-only project copy/i);
  assert.match(prompt, /cannot affect your follow-up inspection/i);
  assert.match(prompt, /\$SANDBOX\/workspace/);
  assert.doesNotMatch(prompt, /\/private\/tmp\/roundtable/);
  assert.match(prompt, /do not claim that your own terminal ran/i);

  assert.deepEqual(makeBrokerCheck(["npm", "test"], result, 2), {
    command: "npm test",
    status: "passed",
    exitCode: 0,
    summary:
      "Roundtable executed this command in a separate local-only network sandbox; it passed.",
    round: 2,
    provenance: "bridge-broker",
  });
  const attachmentManifestId = `sha256:${"c".repeat(64)}`;
  assert.equal(
    makeBrokerCheck(["npm", "test"], result, 2, {
      attachmentManifestId,
    }).attachmentManifestId,
    attachmentManifestId,
  );
});
