import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { access, mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";

const host = "127.0.0.1";
const port = Number(process.env.ROUNDTABLE_BRIDGE_PORT || 4317);
const token = process.env.ROUNDTABLE_BRIDGE_TOKEN || randomBytes(24).toString("base64url");
const sessions = new Map();

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left || "");
  const rightBuffer = Buffer.from(right || "");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function authorized(request, url) {
  const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
  return safeEqual(bearer, token) || safeEqual(url.searchParams.get("token") || "", token);
}

function corsHeaders(request) {
  return {
    "Access-Control-Allow-Origin": request.headers.origin || "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Private-Network": "true",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

function sendJson(request, response, status, payload) {
  response.writeHead(status, {
    ...corsHeaders(request),
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 128_000) throw new Error("Request body is too large.");
  }
  return body ? JSON.parse(body) : {};
}

async function findExecutable(name) {
  for (const directory of (process.env.PATH || "").split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, name);
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Continue through PATH.
    }
  }
  return "";
}

function runSmallCommand(command, args) {
  return new Promise((resolve) => {
    if (!command) return resolve("");
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", () => resolve(""));
    child.on("close", () => resolve(output.trim()));
  });
}

const codexPath = await findExecutable("codex");
const claudePath = await findExecutable("claude");
const sandboxExecPath =
  process.platform === "darwin" ? await findExecutable("sandbox-exec") : "";
const [codexVersion, claudeVersion] = await Promise.all([
  runSmallCommand(codexPath, ["--version"]),
  runSmallCommand(claudePath, ["--version"]),
]);

function emit(session, event) {
  if (event.type === "message") session.messages.push(event.message);
  if (event.type === "session.status") session.lastStatus = event;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of session.clients) client.write(payload);
}

function makeMessage(role, body, round) {
  return {
    id: randomUUID(),
    author: role === "codex" ? "Codex" : role === "claude" ? "Claude" : "You",
    role,
    body: body.trim(),
    at: new Date().toISOString(),
    ...(round ? { round } : {}),
  };
}

function buildPrompt(session, role, turn) {
  const participant = role === "codex" ? "Codex CLI" : "Claude CLI";
  const other = role === "codex" ? "Claude CLI" : "Codex CLI";
  const transcript = session.messages
    .map((message) => `${message.author.toUpperCase()}:\n${message.body}`)
    .join("\n\n")
    .slice(-48_000);

  return `You are ${participant} in a visible project roundtable with ${other} and a human project owner.

PROJECT FOLDER
${session.projectPath}

DISCUSSION GOAL
${session.topic}

SHARED TRANSCRIPT
${transcript || "(No prior turns.)"}

YOUR TURN
Inspect the project as needed, then advance the discussion. Respond directly to the strongest point in the transcript, identify concrete evidence from the repository, and make a useful recommendation or challenge. Keep this to roughly 250–500 words. Do not edit, create, delete, or rename files. Do not run destructive commands. This is discussion-only mode. Write only your contribution to the roundtable—no preamble about being an AI and no hidden reasoning.

This is turn ${turn + 1} of ${session.totalTurns}.`;
}

function runProcess(session, command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: session.projectPath,
      env: { ...process.env, CI: "1", NO_COLOR: "1", TERM: "dumb" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    session.child = child;
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("The agent turn exceeded the 10-minute limit."));
    }, 10 * 60 * 1000);

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      session.child = null;
      callback();
    };

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 2_000_000) stdout = stdout.slice(-2_000_000);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 40_000) stderr = stderr.slice(-40_000);
    });
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", (code, signal) => {
      finish(() => {
        if (session.stopped || signal === "SIGTERM") return reject(new Error("Discussion stopped."));
        if (code !== 0) {
          return reject(
            new Error(stderr.trim() || stdout.trim() || `Agent process exited with code ${code}.`),
          );
        }
        resolve(stdout.trim());
      });
    });
    child.stdin.end(input);
  });
}

async function runCodex(session, prompt) {
  const outputDirectory = await mkdtemp(join(tmpdir(), "roundtable-codex-"));
  const outputFile = join(outputDirectory, "last-message.txt");
  try {
    await runProcess(
      session,
      codexPath,
      [
        "exec",
        "--color",
        "never",
        "--skip-git-repo-check",
        "--ephemeral",
        "--cd",
        session.projectPath,
        "--sandbox",
        "read-only",
        "--output-last-message",
        outputFile,
        "-",
      ],
      prompt,
    );
    return (await readFile(outputFile, "utf8")).trim();
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
}

async function runClaude(session, prompt) {
  const claudeArgs = [
    "--print",
    "--output-format",
    "text",
    "--permission-mode",
    "plan",
    "--no-session-persistence",
    "--no-chrome",
    "--safe-mode",
    "--strict-mcp-config",
    "--tools",
    "Read,Glob,Grep",
  ];

  if (sandboxExecPath) {
    const escapedProjectPath = session.projectPath
      .replaceAll("\\", "\\\\")
      .replaceAll('"', '\\"');
    const profile = `(version 1)
(allow default)
(deny file-write* (subpath "${escapedProjectPath}"))`;
    return runProcess(
      session,
      sandboxExecPath,
      ["-p", profile, claudePath, ...claudeArgs],
      prompt,
    );
  }

  return runProcess(
    session,
    claudePath,
    claudeArgs,
    prompt,
  );
}

async function runSession(session) {
  try {
    for (let turn = 0; turn < session.totalTurns; turn += 1) {
      if (session.stopped) break;
      const role = turn % 2 === 0 ? "codex" : "claude";
      const round = Math.floor(turn / 2) + 1;
      emit(session, {
        type: "session.status",
        status: "running",
        speaker: role,
        turn,
        totalTurns: session.totalTurns,
      });
      const prompt = buildPrompt(session, role, turn);
      const body =
        role === "codex" ? await runCodex(session, prompt) : await runClaude(session, prompt);
      if (!body) throw new Error(`${role === "codex" ? "Codex" : "Claude"} returned no text.`);
      emit(session, { type: "message", message: makeMessage(role, body, round) });
      session.completedTurns = turn + 1;
      emit(session, {
        type: "session.status",
        status: "running",
        turn: session.completedTurns,
        totalTurns: session.totalTurns,
      });
    }

    emit(session, {
      type: "session.status",
      status: session.stopped ? "stopped" : "complete",
      turn: session.completedTurns,
      totalTurns: session.totalTurns,
    });
  } catch (error) {
    if (session.stopped) {
      emit(session, {
        type: "session.status",
        status: "stopped",
        totalTurns: session.totalTurns,
      });
    } else {
      const message = error instanceof Error ? error.message : "An agent turn failed.";
      emit(session, { type: "message", message: makeMessage("human", `Bridge error: ${message}`) });
      emit(session, {
        type: "session.status",
        status: "error",
        note: message,
        totalTurns: session.totalTurns,
      });
    }
  } finally {
    for (const client of session.clients) client.end();
    session.clients.clear();
  }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    if (request.method === "OPTIONS") {
      response.writeHead(204, corsHeaders(request));
      response.end();
      return;
    }
    if (!authorized(request, url)) {
      sendJson(request, response, 401, { error: "Invalid bridge key." });
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(request, response, 200, {
        ok: true,
        defaultProject: process.cwd(),
        projectWriteGuard: Boolean(sandboxExecPath),
        codex: { available: Boolean(codexPath), version: codexVersion },
        claude: { available: Boolean(claudePath), version: claudeVersion },
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/sessions") {
      if (!codexPath || !claudePath) {
        sendJson(request, response, 400, {
          error: `Missing CLI: ${[!codexPath && "codex", !claudePath && "claude"].filter(Boolean).join(", ")}.`,
        });
        return;
      }
      const payload = await readJson(request);
      const requestedPath = String(payload.projectPath || "").trim();
      const topic = String(payload.topic || "").trim();
      const rounds = Math.max(1, Math.min(5, Number(payload.rounds) || 3));

      if (!isAbsolute(requestedPath)) {
        sendJson(request, response, 400, { error: "Project folder must be an absolute path." });
        return;
      }
      if (/[\u0000-\u001f\u007f]/.test(requestedPath)) {
        sendJson(request, response, 400, { error: "Project folder contains unsupported characters." });
        return;
      }
      const projectPath = await realpath(requestedPath);
      const projectStat = await stat(projectPath);
      if (!projectStat.isDirectory()) {
        sendJson(request, response, 400, { error: "Project folder is not a directory." });
        return;
      }
      if (!topic) {
        sendJson(request, response, 400, { error: "Add a discussion goal first." });
        return;
      }

      const id = randomUUID();
      const session = {
        id,
        projectPath,
        topic,
        totalTurns: rounds * 2,
        completedTurns: 0,
        messages: [],
        clients: new Set(),
        child: null,
        stopped: false,
        lastStatus: {
          type: "session.status",
          status: "running",
          turn: 0,
          totalTurns: rounds * 2,
        },
      };
      sessions.set(id, session);
      sendJson(request, response, 201, { id });
      setImmediate(() => void runSession(session));
      return;
    }

    const match = url.pathname.match(/^\/sessions\/([^/]+)\/(events|steer|stop)$/);
    if (match) {
      const [, id, action] = match;
      const session = sessions.get(id);
      if (!session) {
        sendJson(request, response, 404, { error: "Discussion not found." });
        return;
      }

      if (request.method === "GET" && action === "events") {
        response.writeHead(200, {
          ...corsHeaders(request),
          "Content-Type": "text/event-stream",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        response.write(": connected\n\n");
        for (const message of session.messages) {
          response.write(`data: ${JSON.stringify({ type: "message", message })}\n\n`);
        }
        response.write(`data: ${JSON.stringify(session.lastStatus)}\n\n`);
        session.clients.add(response);
        request.on("close", () => session.clients.delete(response));
        return;
      }

      if (request.method === "POST" && action === "steer") {
        const payload = await readJson(request);
        const text = String(payload.text || "").trim().slice(0, 8_000);
        if (!text) {
          sendJson(request, response, 400, { error: "Steering note cannot be empty." });
          return;
        }
        emit(session, { type: "message", message: makeMessage("human", text) });
        sendJson(request, response, 202, { ok: true });
        return;
      }

      if (request.method === "POST" && action === "stop") {
        session.stopped = true;
        session.child?.kill("SIGTERM");
        sendJson(request, response, 202, { ok: true });
        return;
      }
    }

    sendJson(request, response, 404, { error: "Not found." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bridge request failed.";
    sendJson(request, response, 400, { error: message });
  }
});

server.listen(port, host, () => {
  console.log("");
  console.log("  ROUNDTABLE BRIDGE");
  console.log(`  Listening: http://${host}:${port}`);
  console.log(`  Bridge key: ${token}`);
  console.log("");
  console.log("  Open the app with:");
  console.log(
    `  http://localhost:3000/?bridge=${encodeURIComponent(`http://${host}:${port}`)}&token=${encodeURIComponent(token)}`,
  );
  console.log("");
});
