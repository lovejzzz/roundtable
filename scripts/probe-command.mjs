import { spawn } from "node:child_process";

export const PROBE_TIMEOUT_MS = 15_000;
export const PROBE_MAX_OUTPUT_BYTES = 64 * 1024;
export const PROBE_TERMINATION_GRACE_MS = 2_000;

const PROBE_FAILURE_MESSAGES = {
  timed_out: ({ timeoutMs }) =>
    `timed out after ${Math.ceil(timeoutMs / 1_000)} seconds`,
  output_limit: ({ maxOutputBytes }) =>
    `exceeded the ${Math.ceil(maxOutputBytes / 1024)} KiB output limit`,
  spawn_failed: () => "could not start",
};

export function probeFailureDiagnostic(
  label,
  reason,
  {
    timeoutMs = PROBE_TIMEOUT_MS,
    maxOutputBytes = PROBE_MAX_OUTPUT_BYTES,
  } = {},
) {
  const describe = PROBE_FAILURE_MESSAGES[reason];
  return describe ? `${label} ${describe({ timeoutMs, maxOutputBytes })}.` : "";
}

export function availabilityDiagnostic({
  label,
  path,
  probeFailure,
  compatible,
  authenticated,
  login,
}) {
  if (!path) return `${label} is not installed or is not available on PATH.`;
  if (probeFailure) return probeFailure;
  if (!compatible) return `${label} does not expose the required safe CLI capabilities.`;
  if (!authenticated) {
    return `${label} is not signed in. Run \`${login}\`, then start a new discussion; Roundtable rechecks automatically.`;
  }
  return "";
}

export function firstProbeFailureDiagnostic(probes) {
  for (const [label, result] of probes) {
    const diagnostic = probeFailureDiagnostic(label, result.reason);
    if (diagnostic) return diagnostic;
  }
  return "";
}

export function runBoundedProbe({
  command,
  args = [],
  environment,
  cwd,
  input = "",
  captureOutput = true,
  timeoutMs = PROBE_TIMEOUT_MS,
  maxOutputBytes = PROBE_MAX_OUTPUT_BYTES,
  terminationGraceMs = PROBE_TERMINATION_GRACE_MS,
  spawnImpl = spawn,
}) {
  if (!command) {
    return Promise.resolve({ output: "", success: false, reason: "spawn_failed" });
  }

  return new Promise((resolve) => {
    let child;
    try {
      child = spawnImpl(command, args, {
        ...(environment ? { env: environment } : {}),
        ...(cwd ? { cwd } : {}),
        stdio: captureOutput || input ? [input ? "pipe" : "ignore", "pipe", "pipe"] : "ignore",
      });
    } catch {
      resolve({ output: "", success: false, reason: "spawn_failed" });
      return;
    }

    let outputBytes = 0;
    let outputChunks = [];
    let failureReason = "";
    let settled = false;
    let terminationTimer;

    const signalChild = (signal) => {
      try {
        child.kill(signal);
      } catch (error) {
        if (error?.code !== "ESRCH") throw error;
      }
    };

    const stopCapturing = () => {
      child.stdout?.removeListener("data", onOutput);
      child.stderr?.removeListener("data", onOutput);
      outputChunks = [];
    };

    const failInfrastructure = (reason) => {
      if (failureReason || settled) return;
      failureReason = reason;
      stopCapturing();
      signalChild("SIGTERM");
      terminationTimer = setTimeout(() => signalChild("SIGKILL"), terminationGraceMs);
      terminationTimer.unref?.();
    };

    const onOutput = (chunk) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      outputBytes += bytes.byteLength;
      if (outputBytes > maxOutputBytes) {
        failInfrastructure("output_limit");
        return;
      }
      outputChunks.push(bytes);
    };

    if (captureOutput) {
      child.stdout.on("data", onOutput);
      child.stderr.on("data", onOutput);
    }
    if (input && child.stdin) {
      child.stdin.end(input);
    }

    const timeoutTimer = setTimeout(
      () => failInfrastructure("timed_out"),
      timeoutMs,
    );
    timeoutTimer.unref?.();

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(terminationTimer);
      stopCapturing();
      resolve(result);
    };

    child.on("error", () => {
      failureReason = "spawn_failed";
      finish({ output: "", success: false, reason: failureReason });
    });
    child.on("close", (code) => {
      if (failureReason) {
        finish({ output: "", success: false, reason: failureReason });
        return;
      }
      finish({
        output: captureOutput ? Buffer.concat(outputChunks).toString().trim() : "",
        success: code === 0,
        reason: "",
      });
    });
  });
}
