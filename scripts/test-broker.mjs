import { isAbsolute } from "node:path";
import { redactVisibleString } from "./redaction.mjs";

const REQUEST_FENCE =
  /(?:^|\n)```roundtable-test-request\s*\n([\s\S]*?)\n```\s*$/;
const ALLOWED_EXECUTABLES = new Set([
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "node",
  "npx",
  "python",
  "python3",
  "pytest",
  "uv",
  "cargo",
  "go",
  "make",
  "just",
  "deno",
  "ruby",
  "bundle",
  "gradle",
  "./gradlew",
  "mvn",
  "./mvnw",
]);
const WORKSPACE_EXECUTABLES = new Set(["./gradlew", "./mvnw"]);

function visible(value, limit) {
  return redactVisibleString(value, limit * 2).trim().slice(0, limit);
}

export function displayArgv(argv) {
  return argv
    .map((argument) =>
      /^[A-Za-z0-9_./:@%+=,-]+$/.test(argument)
        ? argument
        : JSON.stringify(argument),
    )
    .join(" ");
}

export function buildBrokerNetworkArgs(profile = "roundtable_workspace") {
  return [
    "--enable",
    "network_proxy",
    "--config",
    `permissions.${profile}.network.enabled=true`,
    "--config",
    `permissions.${profile}.network.allow_local_binding=true`,
    "--config",
    `permissions.${profile}.network.domains={"localhost"="allow","127.0.0.1"="allow"}`,
  ];
}

export async function resolveBrokerArgv(argv, findExecutable) {
  if (WORKSPACE_EXECUTABLES.has(argv[0])) return [...argv];
  const executable = await findExecutable(argv[0]);
  if (!executable || !isAbsolute(executable)) {
    throw new Error(
      `The approved executable ${visible(argv[0], 80)} is not available from a trusted host path.`,
    );
  }
  return [executable, ...argv.slice(1)];
}

export function extractTestRequest(raw) {
  const source = String(raw || "").trim();
  const match = source.match(REQUEST_FENCE);
  if (!match) return { body: source, request: null };

  let payload;
  try {
    payload = JSON.parse(match[1]);
  } catch {
    return {
      body: source.slice(0, match.index).trim(),
      request: { error: "The test request was not valid JSON." },
    };
  }

  if (
    payload?.version !== 1 ||
    !Array.isArray(payload.argv) ||
    payload.argv.length < 1 ||
    payload.argv.length > 16
  ) {
    return {
      body: source.slice(0, match.index).trim(),
      request: { error: "The test request must contain 1–16 argv strings." },
    };
  }

  const argv = payload.argv.map((argument) => String(argument));
  if (
    argv.some(
      (argument) =>
        !argument ||
        argument.length > 240 ||
        /[\u0000-\u001f\u007f]/.test(argument),
    ) ||
    argv.join("").length > 1_200
  ) {
    return {
      body: source.slice(0, match.index).trim(),
      request: { error: "The test request contains an invalid or oversized argument." },
    };
  }

  const executable = argv[0];
  if (!ALLOWED_EXECUTABLES.has(executable)) {
    return {
      body: source.slice(0, match.index).trim(),
      request: {
        error: `The Roundtable broker does not allow the executable ${visible(argv[0], 80)}.`,
      },
    };
  }

  return {
    body: source.slice(0, match.index).trim(),
    request: { argv },
  };
}

function boundedOutput(value, sandboxPaths, limit = 6_000) {
  let output = redactVisibleString(value, limit * 2);
  for (const path of sandboxPaths.filter(Boolean).sort((a, b) => b.length - a.length)) {
    output = output.replaceAll(path, "$SANDBOX");
  }
  return output.trim().slice(-limit);
}

export function buildBrokerResultPrompt({
  originalPrompt,
  argv,
  result,
  sandboxPaths = [],
}) {
  const command = argv ? displayArgv(argv) : "(request rejected)";
  const status = result.status || "blocked";
  const stdout = boundedOutput(result.stdout, sandboxPaths);
  const stderr = boundedOutput(result.stderr, sandboxPaths);
  const details = [
    `Command: ${command}`,
    `Status: ${status}`,
    Number.isInteger(result.exitCode) ? `Exit code: ${result.exitCode}` : "",
    stdout ? `STDOUT\n${stdout}` : "STDOUT\n(empty)",
    stderr ? `STDERR\n${stderr}` : "STDERR\n(empty)",
    result.error ? `Broker note: ${visible(result.error, 500)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return `${originalPrompt}

BROKERED CHECK RESULT
Roundtable executed the requested argv directly, without a shell, in a separate local-only network
sandbox over a broker-only project copy. Loopback is available for local test servers, while
external and private-network destinations remain blocked. Host home data, the original project,
and every agent workspace remained inaccessible. Files created or changed by the command are
deleted with that broker-only copy and cannot affect your follow-up inspection.

${details}

Now provide your final roundtable contribution. Interpret this result accurately. Do not emit a
roundtable-test-request or roundtable-checks block, and do not claim that your own terminal ran
the command.`;
}

export function makeBrokerCheck(argv, result, round) {
  const status = result.status || "blocked";
  return {
    command: argv ? displayArgv(argv) : "(request rejected)",
    status,
    ...(Number.isInteger(result.exitCode) ? { exitCode: result.exitCode } : {}),
    summary:
      status === "passed"
        ? "Roundtable executed this command in a separate local-only network sandbox; it passed."
        : status === "failed"
          ? "Roundtable executed this command in a separate local-only network sandbox; it failed."
          : visible(result.error, 600) ||
            "Roundtable could not execute this request in the separate test sandbox.",
    ...(round ? { round } : {}),
    provenance: "bridge-broker",
  };
}
