import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

export const TERMINAL_PHASES = new Set(["complete", "stopped", "error"]);
const OUTCOME_OWNERS = new Set(["You", "Codex", "Claude", "Unassigned"]);

export function buildTranscript(messages, maxCharacters = 48_000) {
  const selected = [];
  let length = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const block = `${message.author.toUpperCase()}:\n${message.body}`;
    if (selected.length && length + block.length + 2 > maxCharacters) break;
    selected.unshift(block);
    length += block.length + 2;
  }
  return selected.join("\n\n");
}

function excerptBody(body, limit) {
  if (body.length <= limit) return body;
  const marker = "\n… [excerpt shortened] …\n";
  const available = Math.max(0, limit - marker.length);
  const start = Math.ceil(available * 0.65);
  return `${body.slice(0, start)}${marker}${body.slice(-(available - start))}`;
}

export function buildOutcomeInput(topic, messages, maxCharacters = 96_000) {
  const normalized = messages.map((message, index) => ({
    index,
    author: message.author,
    round: message.round ?? null,
    body: String(message.body || ""),
  }));
  const totalCharacters = normalized.reduce((sum, message) => sum + message.body.length, 0);
  const metadataLength = normalized.reduce(
    (sum, message) => sum + `MESSAGE ${message.index + 1} · ${message.author} · ROUND ${message.round ?? "—"}\n`.length + 2,
    0,
  );
  const fixedLength = `DISCUSSION GOAL\n${topic}\n\nTRANSCRIPT\n`.length + metadataLength;
  const bodyBudget = Math.max(0, maxCharacters - fixedLength);
  const perMessageBudget = normalized.length
    ? Math.max(240, Math.floor(bodyBudget / normalized.length))
    : 0;
  const blocks = normalized.map(
    (message) =>
      `MESSAGE ${message.index + 1} · ${message.author} · ROUND ${message.round ?? "—"}\n${excerptBody(message.body, perMessageBudget)}`,
  );
  const includedCharacters = normalized.reduce(
    (sum, message) => sum + Math.min(message.body.length, perMessageBudget),
    0,
  );
  return {
    text: `DISCUSSION GOAL\n${topic}\n\nTRANSCRIPT\n${blocks.join("\n\n")}`,
    coverage: {
      truncated: includedCharacters < totalCharacters,
      includedCharacters,
      totalCharacters,
      messageCount: normalized.length,
    },
  };
}

export function extractOutcomeJson(raw) {
  const source = String(raw || "").trim();
  const unfenced = source
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The outcome did not contain a JSON object.");
  let parsed;
  try {
    parsed = JSON.parse(unfenced.slice(start, end + 1));
  } catch {
    throw new Error("The outcome was not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The outcome must be a JSON object.");
  }
  const decision = String(parsed.decision || "").trim();
  const rationale = String(parsed.rationale || "").trim();
  if (!decision || !rationale) throw new Error("The outcome is missing a decision or rationale.");
  if (!Array.isArray(parsed.actions) || !Array.isArray(parsed.openQuestions)) {
    throw new Error("The outcome is missing actions or open questions.");
  }
  const actions = parsed.actions.map((action) => {
    const owner = String(action?.owner || "").trim();
    const text = String(action?.text || "").trim();
    if (!OUTCOME_OWNERS.has(owner) || !text) {
      throw new Error("The outcome contains an invalid action item.");
    }
    return { owner, text: text.slice(0, 1_200) };
  });
  const openQuestions = parsed.openQuestions.map((question) => {
    const text = String(question || "").trim();
    if (!text) throw new Error("The outcome contains an empty open question.");
    return text.slice(0, 1_200);
  });
  if (typeof parsed.consensus !== "boolean") {
    throw new Error("The outcome must say whether consensus was reached.");
  }
  return {
    status: "available",
    decision: decision.slice(0, 2_000),
    rationale: rationale.slice(0, 4_000),
    actions,
    openQuestions,
    consensus: parsed.consensus,
  };
}

function makeMessage(now, role, body, round, model, effort) {
  return {
    id: randomUUID(),
    author: role === "codex" ? "Codex" : role === "claude" ? "Claude" : "You",
    role,
    body: body.trim(),
    at: now().toISOString(),
    ...(round ? { round } : {}),
    ...(model ? { model } : {}),
    ...(effort ? { effort } : {}),
  };
}

function safeVisibleError(error) {
  const raw = error instanceof Error ? error.message : "An agent turn failed.";
  return raw
    .replace(/\b(?:sk-|art_v1_|api[_-]?key[:=]?)[A-Za-z0-9._-]{10,}\b/gi, "[redacted]")
    .slice(0, 700);
}

function buildPrompt(session, role, turn) {
  const participant = role === "codex" ? "Codex CLI" : "Claude CLI";
  const other = role === "codex" ? "Claude CLI" : "Codex CLI";
  const transcript = buildTranscript(session.messages);

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

function buildOutcomePrompt(session, outcomeInput) {
  return `You are Codex CLI, producing the final structured brief for a visible project roundtable.

Read the complete supplied discussion coverage. Faithfully represent disagreement; do not invent
consensus or action items. Return only one JSON object, without markdown fences, matching:
{
  "decision": "the recommendation or explicit no-consensus result",
  "rationale": "why the room reached this result",
  "actions": [{"owner": "You|Codex|Claude|Unassigned", "text": "ordered next action"}],
  "openQuestions": ["unresolved question or disagreement"],
  "consensus": true
}

Use the existing participant name "You" for the human owner. Keep actions in transcript order.

${outcomeInput.text}`;
}

export function createBridge({
  token,
  defaultProject,
  health,
  agentRunner,
  resolveProject,
  allowedOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"],
  now = () => new Date(),
  sessionTtlMs = 60 * 60 * 1000,
  maxSessions = 20,
}) {
  const sessions = new Map();
  const tickets = new Map();

  function corsHeaders(request) {
    const origin = request.headers.origin;
    const allowedOrigin = !origin || allowedOrigins.includes(origin) ? origin || "*" : "";
    return {
      ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
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

  function authorized(request) {
    const bearer = request.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
    return bearer === token;
  }

  function consumeTicket(sessionId, suppliedTicket) {
    const ticket = tickets.get(suppliedTicket);
    tickets.delete(suppliedTicket);
    return Boolean(ticket && ticket.sessionId === sessionId && ticket.expiresAt > Date.now());
  }

  function sweepTickets() {
    const currentTime = Date.now();
    for (const [ticket, value] of tickets) {
      if (value.expiresAt <= currentTime) tickets.delete(ticket);
    }
  }

  function emit(session, event) {
    if (event.type === "message") session.messages.push(event.message);
    if (event.type === "session.outcome") session.outcome = event.outcome;
    if (event.type === "session.status") session.lastStatus = event;
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of session.clients) client.write(payload);
  }

  function setPhase(session, phase, extra = {}) {
    session.phase = phase;
    emit(session, {
      type: "session.status",
      status: phase === "stopping" ? "running" : phase,
      turn: session.completedTurns,
      totalTurns: session.totalTurns,
      ...extra,
    });
  }

  function flushSteering(session, targetTurn = Infinity) {
    const retained = [];
    for (const queued of session.pendingSteering) {
      if (queued.targetTurn <= targetTurn) emit(session, { type: "message", message: queued.message });
      else retained.push(queued);
    }
    session.pendingSteering = retained;
  }

  function scheduleEviction(session) {
    session.endedAt = Date.now();
    const timer = setTimeout(() => {
      const current = sessions.get(session.id);
      if (current === session && TERMINAL_PHASES.has(session.phase) && !session.clients.size) {
        sessions.delete(session.id);
      }
    }, sessionTtlMs);
    timer.unref?.();
  }

  function evictOverflow() {
    if (sessions.size < maxSessions) return;
    const terminal = [...sessions.values()]
      .filter((session) => TERMINAL_PHASES.has(session.phase))
      .sort((left, right) => (left.endedAt || 0) - (right.endedAt || 0));
    while (sessions.size >= maxSessions && terminal.length) {
      sessions.delete(terminal.shift().id);
    }
  }

  async function runSession(session) {
    try {
      session.phase = session.stopRequested ? "stopping" : "running";
      for (let turn = 0; turn < session.totalTurns; turn += 1) {
        if (session.phase === "stopping" || session.stopRequested) break;
        session.currentTurn = turn;
        flushSteering(session, turn);
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
        const body = await agentRunner.run({ session, role, prompt });
        if (!body) throw new Error(`${role === "codex" ? "Codex" : "Claude"} returned no text.`);
        const model = role === "codex" ? session.codexModel : session.claudeModel;
        const effort = role === "codex" ? session.codexEffort : session.claudeEffort;
        emit(session, {
          type: "message",
          message: makeMessage(now, role, body, round, model, effort),
        });
        session.completedTurns = turn + 1;
        emit(session, {
          type: "session.status",
          status: "running",
          turn: session.completedTurns,
          totalTurns: session.totalTurns,
        });
      }

      flushSteering(session);
      if (session.phase === "stopping" || session.stopRequested) {
        const stoppedInput = buildOutcomeInput(session.topic, session.messages);
        emit(session, {
          type: "session.outcome",
          outcome: {
            status: "unavailable",
            reason: "stopped",
            message: "The discussion was stopped before a completion brief could be produced.",
            coverage: stoppedInput.coverage,
            synthesizedBy: "Codex",
          },
        });
        setPhase(session, "stopped");
        return;
      }

      const outcomeInput = buildOutcomeInput(session.topic, session.messages);
      setPhase(session, "synthesizing");
      try {
        const rawOutcome = await agentRunner.run({
          session,
          role: "codex",
          purpose: "synthesis",
          prompt: buildOutcomePrompt(session, outcomeInput),
        });
        const outcome = {
          ...extractOutcomeJson(rawOutcome),
          coverage: outcomeInput.coverage,
          synthesizedBy: "Codex",
        };
        emit(session, { type: "session.outcome", outcome });
      } catch (error) {
        const skipped = session.skipOutcomeRequested && error?.code === "USER_STOP";
        emit(session, {
          type: "session.outcome",
          outcome: {
            status: "unavailable",
            reason: skipped ? "skipped" : "failed",
            message: skipped
              ? "The completion brief was skipped. The transcript is complete."
              : `The transcript is complete, but the brief could not be produced: ${safeVisibleError(error)}`,
            coverage: outcomeInput.coverage,
            synthesizedBy: "Codex",
          },
        });
      }
      setPhase(session, "complete");
    } catch (error) {
      flushSteering(session);
      if (session.phase === "stopping" || error?.code === "USER_STOP") {
        if (!session.outcome) {
          const stoppedInput = buildOutcomeInput(session.topic, session.messages);
          emit(session, {
            type: "session.outcome",
            outcome: {
              status: "unavailable",
              reason: "stopped",
              message: "The discussion was stopped before a completion brief could be produced.",
              coverage: stoppedInput.coverage,
              synthesizedBy: "Codex",
            },
          });
        }
        setPhase(session, "stopped");
      } else {
        const visibleMessage = safeVisibleError(error);
        emit(session, {
          type: "message",
          message: makeMessage(now, "human", `Bridge error: ${visibleMessage}`),
        });
        setPhase(session, "error", {
          note: error instanceof Error ? error.message.slice(0, 4_000) : visibleMessage,
        });
      }
    } finally {
      for (const client of session.clients) client.end();
      session.clients.clear();
      scheduleEviction(session);
    }
  }

  function sessionSnapshot(session) {
    return {
      id: session.id,
      phase: session.phase,
      projectPath: session.projectPath,
      topic: session.topic,
      codexModel: session.codexModel,
      claudeModel: session.claudeModel,
      codexEffort: session.codexEffort,
      claudeEffort: session.claudeEffort,
      totalTurns: session.totalTurns,
      completedTurns: session.completedTurns,
      messages: session.messages,
      outcome: session.outcome,
      lastStatus: session.lastStatus,
    };
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (request.method === "OPTIONS") {
        response.writeHead(204, corsHeaders(request));
        response.end();
        return;
      }

      const eventMatch = url.pathname.match(/^\/sessions\/([^/]+)\/events$/);
      if (eventMatch) {
        const session = sessions.get(eventMatch[1]);
        if (!session) {
          sendJson(request, response, 404, { error: "Discussion not found." });
          return;
        }
        if (!consumeTicket(session.id, url.searchParams.get("ticket") || "")) {
          sendJson(request, response, 401, { error: "Invalid or expired stream ticket." });
          return;
        }
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
        if (session.outcome) {
          response.write(
            `data: ${JSON.stringify({ type: "session.outcome", outcome: session.outcome })}\n\n`,
          );
        }
        response.write(`data: ${JSON.stringify(session.lastStatus)}\n\n`);
        if (TERMINAL_PHASES.has(session.phase)) {
          response.end();
          return;
        }
        session.clients.add(response);
        request.on("close", () => session.clients.delete(response));
        return;
      }

      if (!authorized(request)) {
        sendJson(request, response, 401, { error: "Invalid bridge key." });
        return;
      }

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(request, response, 200, {
          ok: true,
          defaultProject,
          ...health,
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/sessions") {
        if (!health.codex.available || !health.claude.available) {
          sendJson(request, response, 400, { error: "Both CLIs must be available." });
          return;
        }
        const payload = await readJson(request);
        const topic = String(payload.topic || "").trim();
        const rounds = Math.max(1, Math.min(5, Number(payload.rounds) || 3));
        const codexModel = String(payload.codexModel || health.models.codex.configured).trim();
        const claudeModel = String(payload.claudeModel || health.models.claude.configured).trim();
        const codexEffort = String(payload.codexEffort || health.models.codex.effort).trim();
        const claudeEffort = String(payload.claudeEffort || health.models.claude.effort).trim();

        if (!topic) {
          sendJson(request, response, 400, { error: "Add a discussion goal first." });
          return;
        }
        const projectPath = await resolveProject(String(payload.projectPath || "").trim());
        const modelPattern = /^[A-Za-z0-9._:/[\]-]+$/;
        if (
          (codexModel && !modelPattern.test(codexModel)) ||
          (claudeModel && !modelPattern.test(claudeModel))
        ) {
          sendJson(request, response, 400, { error: "Model names contain unsupported characters." });
          return;
        }
        if (
          !health.models.codex.efforts.includes(codexEffort) ||
          !health.models.claude.efforts.includes(claudeEffort)
        ) {
          sendJson(request, response, 400, { error: "Reasoning effort is not supported." });
          return;
        }

        evictOverflow();
        if (sessions.size >= maxSessions) {
          sendJson(request, response, 429, { error: "Too many retained discussions." });
          return;
        }

        const id = randomUUID();
        const session = {
          id,
          phase: "starting",
          projectPath,
          topic,
          codexModel,
          claudeModel,
          codexEffort,
          claudeEffort,
          totalTurns: rounds * 2,
          completedTurns: 0,
          currentTurn: -1,
          messages: [],
          pendingSteering: [],
          stopRequested: false,
          skipOutcomeRequested: false,
          clients: new Set(),
          child: null,
          outcome: null,
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

      const sessionMatch = url.pathname.match(/^\/sessions\/([^/]+)$/);
      if (request.method === "GET" && sessionMatch) {
        const session = sessions.get(sessionMatch[1]);
        if (!session) {
          sendJson(request, response, 404, { error: "Discussion not found." });
          return;
        }
        sendJson(request, response, 200, sessionSnapshot(session));
        return;
      }

      const actionMatch = url.pathname.match(/^\/sessions\/([^/]+)\/(ticket|steer|stop)$/);
      if (actionMatch) {
        const [, id, action] = actionMatch;
        const session = sessions.get(id);
        if (!session) {
          sendJson(request, response, 404, { error: "Discussion not found." });
          return;
        }

        if (request.method === "POST" && action === "ticket") {
          sweepTickets();
          const ticket = randomUUID();
          tickets.set(ticket, { sessionId: id, expiresAt: Date.now() + 30_000 });
          sendJson(request, response, 201, { ticket });
          return;
        }

        if (request.method === "POST" && action === "steer") {
          if (session.phase !== "running") {
            sendJson(request, response, 409, { error: "This discussion has already ended." });
            return;
          }
          if (session.currentTurn >= session.totalTurns - 1) {
            sendJson(request, response, 409, { error: "There is no remaining agent turn to steer." });
            return;
          }
          const payload = await readJson(request);
          const text = String(payload.text || "").trim().slice(0, 8_000);
          if (!text) {
            sendJson(request, response, 400, { error: "Steering note cannot be empty." });
            return;
          }
          const message = makeMessage(now, "human", text);
          session.pendingSteering.push({
            message,
            targetTurn: Math.max(0, session.currentTurn + 1),
          });
          sendJson(request, response, 202, { ok: true, message });
          return;
        }

        if (request.method === "POST" && action === "stop") {
          if (TERMINAL_PHASES.has(session.phase)) {
            sendJson(request, response, 409, { error: "This discussion has already ended." });
            return;
          }
          if (session.phase === "synthesizing") {
            session.skipOutcomeRequested = true;
            void agentRunner.stop(session, "user_stop");
            sendJson(request, response, 202, { ok: true, skippingOutcome: true });
            return;
          }
          if (session.phase !== "stopping") {
            session.stopRequested = true;
            session.phase = "stopping";
            void agentRunner.stop(session, "user_stop");
          }
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

  return { server, sessions };
}
