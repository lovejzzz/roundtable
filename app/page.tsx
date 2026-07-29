"use client";

import {
  ArrowRight,
  CircleStop,
  FolderOpen,
  KeyRound,
  Radio,
  RefreshCw,
  Send,
  Sparkles,
  Terminal,
  Wifi,
  WifiOff,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Speaker = "codex" | "claude" | "human";

type Message = {
  id: string;
  author: string;
  role: Speaker;
  body: string;
  at: string;
  round?: number;
};

type BridgeHealth = {
  ok: boolean;
  defaultProject: string;
  projectWriteGuard: boolean;
  codex: { available: boolean; version: string };
  claude: { available: boolean; version: string };
};

type SessionEvent =
  | { type: "message"; message: Message }
  | {
      type: "session.status";
      status: SessionStatus;
      speaker?: Exclude<Speaker, "human">;
      turn?: number;
      totalTurns?: number;
      note?: string;
    };

type SessionStatus =
  | "idle"
  | "connecting"
  | "running"
  | "complete"
  | "stopped"
  | "error";

const SAMPLE_MESSAGES: Message[] = [
  {
    id: "sample-1",
    author: "Codex",
    role: "codex",
    at: "10:42",
    round: 1,
    body: "I mapped the request path and found one decision that should come first: keep the orchestration local, then expose only the discussion stream to the interface. That preserves access to the repository without turning the browser into a privileged process.",
  },
  {
    id: "sample-2",
    author: "Claude",
    role: "claude",
    at: "10:43",
    round: 1,
    body: "Agreed on the boundary. I’d add a strict turn contract: each agent receives the same transcript, the project goal, and any human steering queued since the prior turn. That makes the conversation inspectable and prevents one agent from silently inheriting hidden state.",
  },
  {
    id: "sample-3",
    author: "You",
    role: "human",
    at: "10:44",
    body: "Prioritize a usable first version. Keep both agents in discussion-only mode for now.",
  },
];

const DEFAULT_BRIDGE = "http://127.0.0.1:4317";

function shortVersion(version?: string) {
  return version?.replace(/^codex-cli\s*/i, "").replace(/\s*\(Claude Code\)$/i, "") || "—";
}

function displayTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function Home() {
  const [bridgeUrl, setBridgeUrl] = useState(DEFAULT_BRIDGE);
  const [token, setToken] = useState("");
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<Message[]>(SAMPLE_MESSAGES);
  const [isPreview, setIsPreview] = useState(true);
  const [speaker, setSpeaker] = useState<"codex" | "claude" | null>(null);
  const [turn, setTurn] = useState(0);
  const [totalTurns, setTotalTurns] = useState(6);
  const [projectPath, setProjectPath] = useState("");
  const [topic, setTopic] = useState(
    "Review this project’s architecture and agree on the highest-leverage next steps.",
  );
  const [rounds, setRounds] = useState("3");
  const [steering, setSteering] = useState("");
  const [connectOpen, setConnectOpen] = useState(false);
  const streamRef = useRef<EventSource | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);

  const connected = Boolean(health?.ok);
  const active = status === "running";

  const progress = useMemo(() => {
    if (!totalTurns) return 0;
    return Math.min(100, Math.round((turn / totalTurns) * 100));
  }, [turn, totalTurns]);

  async function connect(nextToken = token, nextBridge = bridgeUrl) {
    if (!nextToken.trim()) {
      setConnectionError("Paste the bridge key printed by npm run talk.");
      setConnectOpen(true);
      return;
    }

    setStatus((current) => (current === "running" ? current : "connecting"));
    setConnectionError("");
    try {
      const response = await fetch(
        `${nextBridge.replace(/\/$/, "")}/health?token=${encodeURIComponent(nextToken.trim())}`,
      );
      if (!response.ok) throw new Error("The bridge key was not accepted.");
      const data = (await response.json()) as BridgeHealth;
      setHealth(data);
      setToken(nextToken.trim());
      setBridgeUrl(nextBridge.replace(/\/$/, ""));
      localStorage.setItem("roundtable.bridge", nextBridge.replace(/\/$/, ""));
      localStorage.setItem("roundtable.token", nextToken.trim());
      if (!projectPath) setProjectPath(data.defaultProject);
      setStatus((current) => (current === "connecting" ? "idle" : current));
      setConnectOpen(false);
    } catch (error) {
      setHealth(null);
      setStatus("idle");
      setConnectionError(error instanceof Error ? error.message : "Could not reach the bridge.");
      setConnectOpen(true);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryToken = params.get("token");
    const queryBridge = params.get("bridge");
    const savedToken = localStorage.getItem("roundtable.token") || "";
    const savedBridge = localStorage.getItem("roundtable.bridge") || DEFAULT_BRIDGE;
    const initialToken = queryToken || savedToken;
    const initialBridge = queryBridge || savedBridge;

    setToken(initialToken);
    setBridgeUrl(initialBridge);
    if (queryToken || queryBridge) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (initialToken) void connect(initialToken, initialBridge);

    return () => streamRef.current?.close();
    // Initial bridge discovery runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!feedRef.current) return;
    feedRef.current.scrollTo({
      top: feedRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, speaker]);

  function openStream(id: string) {
    streamRef.current?.close();
    const stream = new EventSource(
      `${bridgeUrl}/sessions/${id}/events?token=${encodeURIComponent(token)}`,
    );
    streamRef.current = stream;
    stream.onmessage = (event) => {
      const update = JSON.parse(event.data) as SessionEvent;
      if (update.type === "message") {
        setMessages((current) =>
          current.some((message) => message.id === update.message.id)
            ? current
            : [...current, update.message],
        );
        return;
      }
      setStatus(update.status);
      setSpeaker(update.speaker || null);
      if (typeof update.turn === "number") setTurn(update.turn);
      if (typeof update.totalTurns === "number") setTotalTurns(update.totalTurns);
      if (update.status !== "running") stream.close();
    };
    stream.onerror = () => {
      if (status === "running") setConnectionError("The live stream was interrupted.");
    };
  }

  async function startDiscussion(event: FormEvent) {
    event.preventDefault();
    if (!connected) {
      setConnectOpen(true);
      return;
    }
    setConnectionError("");
    const response = await fetch(`${bridgeUrl}/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectPath: projectPath.trim(),
        topic: topic.trim(),
        rounds: Number(rounds),
      }),
    });
    const data = (await response.json()) as { id?: string; error?: string };
    if (!response.ok || !data.id) {
      setConnectionError(data.error || "The discussion could not be started.");
      return;
    }
    setMessages([]);
    setIsPreview(false);
    setSessionId(data.id);
    setStatus("running");
    setTurn(0);
    setTotalTurns(Number(rounds) * 2);
    openStream(data.id);
  }

  async function sendSteering(event: FormEvent) {
    event.preventDefault();
    if (!sessionId || !steering.trim()) return;
    const text = steering.trim();
    setSteering("");
    const response = await fetch(`${bridgeUrl}/sessions/${sessionId}/steer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
    if (!response.ok) setConnectionError("Your steering note could not be queued.");
  }

  async function stopDiscussion() {
    if (!sessionId) return;
    await fetch(`${bridgeUrl}/sessions/${sessionId}/stop`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Roundtable home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>ROUNDTABLE</span>
        </a>
        <div className="topbar-center">
          <span className={`live-dot ${active ? "is-live" : ""}`} />
          {active ? `LIVE · TURN ${turn + 1}` : isPreview ? "PRODUCT PREVIEW" : status.toUpperCase()}
        </div>
        <button
          className={`connection-button ${connected ? "connected" : ""}`}
          onClick={() => setConnectOpen((value) => !value)}
          type="button"
        >
          {connected ? <Wifi size={15} /> : <WifiOff size={15} />}
          {connected ? "Bridge connected" : "Connect bridge"}
        </button>
      </header>

      {connectOpen && (
        <section className="connection-drawer" aria-label="Bridge connection">
          <div>
            <p className="eyebrow">LOCAL BRIDGE</p>
            <h2>Connect this room to your CLIs.</h2>
            <p>The key stays in this browser and unlocks only the bridge on your Mac.</p>
          </div>
          <label>
            <span>Bridge address</span>
            <input
              value={bridgeUrl}
              onChange={(event) => setBridgeUrl(event.target.value)}
              spellCheck={false}
            />
          </label>
          <label>
            <span>Bridge key</span>
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Paste key from the terminal"
            />
          </label>
          <button className="primary compact" type="button" onClick={() => void connect()}>
            <KeyRound size={16} />
            Connect
          </button>
        </section>
      )}

      <div className="workspace-grid">
        <aside className="setup-panel">
          <div className="panel-heading">
            <p className="eyebrow">NEW DISCUSSION</p>
            <span className="step-count">01</span>
          </div>
          <form onSubmit={startDiscussion}>
            <label className="field">
              <span>Project folder</span>
              <div className="input-with-icon">
                <FolderOpen size={16} />
                <input
                  value={projectPath}
                  onChange={(event) => setProjectPath(event.target.value)}
                  placeholder="/path/to/your/project"
                  spellCheck={false}
                  required
                />
              </div>
            </label>

            <label className="field">
              <span>What should they discuss?</span>
              <textarea
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                rows={6}
                required
              />
            </label>

            <div className="field-row">
              <label className="field">
                <span>Rounds</span>
                <select value={rounds} onChange={(event) => setRounds(event.target.value)}>
                  <option value="1">1 round</option>
                  <option value="2">2 rounds</option>
                  <option value="3">3 rounds</option>
                  <option value="4">4 rounds</option>
                  <option value="5">5 rounds</option>
                </select>
              </label>
              <div className="field mode-field">
                <span>Access</span>
                <div className="mode-lock">
                  <span className="safe-dot" />
                  Discuss only
                </div>
              </div>
            </div>

            <button className="primary" type="submit" disabled={active}>
              {active ? <Radio size={17} /> : <Sparkles size={17} />}
              {active ? "Discussion running" : "Start the roundtable"}
              {!active && <ArrowRight size={17} />}
            </button>
          </form>

          <div className="agent-stack">
            <p className="eyebrow">PARTICIPANTS</p>
            <div className="agent-row">
              <span className="agent-glyph codex-glyph">C</span>
              <div>
                <strong>Codex CLI</strong>
                <small>{connected ? shortVersion(health?.codex.version) : "Waiting for bridge"}</small>
              </div>
              <span className={`presence ${health?.codex.available ? "online" : ""}`} />
            </div>
            <div className="agent-row">
              <span className="agent-glyph claude-glyph">A</span>
              <div>
                <strong>Claude CLI</strong>
                <small>{connected ? shortVersion(health?.claude.version) : "Waiting for bridge"}</small>
              </div>
              <span className={`presence ${health?.claude.available ? "online" : ""}`} />
            </div>
          </div>
        </aside>

        <section className="conversation-panel">
          <div className="conversation-header">
            <div>
              <p className="eyebrow">{isPreview ? "CONVERSATION PREVIEW" : "PROJECT ROOM"}</p>
              <h1>Two agents. One project.<br />You set the direction.</h1>
            </div>
            {active && (
              <button className="stop-button" type="button" onClick={stopDiscussion}>
                <CircleStop size={16} />
                Stop
              </button>
            )}
          </div>

          <div className="progress-rail" aria-label={`Discussion progress ${progress}%`}>
            <span style={{ width: `${progress}%` }} />
          </div>

          <div className="message-feed" ref={feedRef}>
            {messages.length === 0 && !speaker && (
              <div className="empty-state">
                <Terminal size={25} />
                <h2>The room is ready.</h2>
                <p>Your first agent turn will appear here.</p>
              </div>
            )}
            {messages.map((message) => (
              <article className={`message ${message.role}`} key={message.id}>
                <div className="message-meta">
                  <span className={`agent-glyph ${message.role}-glyph`}>
                    {message.role === "codex" ? "C" : message.role === "claude" ? "A" : "Y"}
                  </span>
                  <div>
                    <strong>{message.author}</strong>
                    <small>
                      {message.round ? `ROUND ${message.round} · ` : ""}
                      {displayTime(message.at)}
                    </small>
                  </div>
                </div>
                <p>{message.body}</p>
              </article>
            ))}
            {speaker && (
              <article className={`message thinking ${speaker}`}>
                <div className="message-meta">
                  <span className={`agent-glyph ${speaker}-glyph`}>
                    {speaker === "codex" ? "C" : "A"}
                  </span>
                  <div>
                    <strong>{speaker === "codex" ? "Codex" : "Claude"}</strong>
                    <small>READING THE ROOM</small>
                  </div>
                </div>
                <div className="thinking-line">
                  <span />
                  <span />
                  <span />
                </div>
              </article>
            )}
          </div>

          <form className="steer-bar" onSubmit={sendSteering}>
            <div className="steer-label">
              <span className="human-pulse" />
              STEER THE NEXT TURN
            </div>
            <div className="steer-input">
              <textarea
                value={steering}
                onChange={(event) => setSteering(event.target.value)}
                placeholder={
                  active
                    ? "Add a priority, correction, or question…"
                    : "Start a live discussion to add your voice…"
                }
                rows={2}
                disabled={!active}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <button type="submit" disabled={!active || !steering.trim()} aria-label="Send steering note">
                <Send size={18} />
              </button>
            </div>
            <small>⌘ ENTER TO SEND · INSERTED BEFORE THE NEXT AGENT TURN</small>
          </form>
        </section>

        <aside className="context-panel">
          <div className="panel-heading">
            <p className="eyebrow">ROOM CONTEXT</p>
            <span className="step-count">02</span>
          </div>

          <section className="context-block">
            <span className="context-label">CURRENT FOCUS</span>
            <p>{topic || "No focus set yet."}</p>
          </section>

          <section className="context-block">
            <span className="context-label">TURN ORDER</span>
            <ol className="turn-order">
              <li className={speaker === "codex" ? "current" : ""}>
                <span className="codex-number">01</span>
                Codex
              </li>
              <li className={speaker === "claude" ? "current" : ""}>
                <span className="claude-number">02</span>
                Claude
              </li>
              <li>
                <span className="human-number">↳</span>
                Your steering
              </li>
            </ol>
          </section>

          <section className="context-block">
            <span className="context-label">SAFETY BOUNDARY</span>
            <div className="safety-note">
              <span className="safe-dot" />
              <p>
                Codex runs in a read-only sandbox. Claude runs in safe mode with only Read, Glob,
                and Grep{health?.projectWriteGuard ? ", plus a macOS project write guard" : ""}.
              </p>
            </div>
          </section>

          {connectionError && (
            <section className="error-note" role="alert">
              <WifiOff size={16} />
              <p>{connectionError}</p>
              <button type="button" onClick={() => void connect()}>
                <RefreshCw size={14} />
                Retry
              </button>
            </section>
          )}

          <div className="room-quote">
            <span>“</span>
            <p>Good collaboration is visible, interruptible, and accountable.</p>
          </div>
        </aside>
      </div>
    </main>
  );
}
