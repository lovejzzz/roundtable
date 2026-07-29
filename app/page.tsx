"use client";

import {
  ArrowRight,
  Check,
  CircleStop,
  Copy,
  Download,
  FolderOpen,
  History,
  KeyRound,
  Radio,
  RefreshCw,
  Send,
  Sparkles,
  Terminal,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { CSSProperties, FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Speaker = "codex" | "claude" | "human";

type Message = {
  id: string;
  author: string;
  role: Speaker;
  body: string;
  at: string;
  round?: number;
  model?: string;
  effort?: string;
};

type OutcomeCoverage = {
  truncated: boolean;
  includedCharacters: number;
  totalCharacters: number;
  messageCount: number;
};

type Outcome =
  | {
      status: "available";
      decision: string;
      rationale: string;
      actions: { owner: "You" | "Codex" | "Claude" | "Unassigned"; text: string }[];
      openQuestions: string[];
      consensus: boolean;
      coverage: OutcomeCoverage;
      synthesizedBy: "Codex";
    }
  | {
      status: "unavailable";
      reason: "skipped" | "failed" | "stopped";
      message: string;
      coverage: OutcomeCoverage;
      synthesizedBy: "Codex";
    };

type BridgeHealth = {
  ok: boolean;
  defaultProject: string;
  projectWriteGuard: boolean;
  models: {
    codex: { configured: string; effort: string; efforts: string[] };
    claude: { configured: string; effort: string; efforts: string[] };
  };
  codex: { available: boolean; version: string };
  claude: { available: boolean; version: string };
  history: {
    available: boolean;
    retention: { maxRecords: number; maxDays: number };
  };
};

type SessionEvent =
  | { type: "message"; message: Message }
  | { type: "session.outcome"; outcome: Outcome }
  | { type: "session.history"; warning: string }
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
  | "synthesizing"
  | "complete"
  | "stopped"
  | "error"
  | "interrupted";

type SessionSnapshot = {
  id: string;
  phase: SessionStatus | "starting" | "stopping";
  projectPath: string;
  topic: string;
  codexModel: string;
  claudeModel: string;
  codexEffort: string;
  claudeEffort: string;
  totalTurns: number;
  completedTurns: number;
  messages: Message[];
  outcome: Outcome | null;
  pendingSteering: Message[];
  historyWarning: string;
  archived?: boolean;
  lastStatus: Extract<SessionEvent, { type: "session.status" }>;
};

type HistoryRecord = {
  id: string;
  topic: string;
  projectName: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  totalTurns: number;
  messageCount: number;
  hasOutcome: boolean;
  historyWarning?: string;
};

const TERMINAL_STATUSES = new Set<SessionStatus>([
  "complete",
  "stopped",
  "error",
  "interrupted",
]);
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
const DEFAULT_EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"];

function friendlyModelName(role: Exclude<Speaker, "human">, model: string) {
  if (!model) return "CLI default";
  const normalized = model.toLowerCase();
  if (role === "claude") {
    if (normalized.includes("opus")) {
      const version = normalized.match(/opus-(\d+(?:-\d+)*)/)?.[1]?.replaceAll("-", ".") || "5";
      return `Claude Opus ${version}${normalized.includes("[1m]") ? " · 1M" : ""}`;
    }
    if (normalized.includes("sonnet")) {
      const version = normalized.match(/sonnet-(\d+(?:-\d+)*)/)?.[1]?.replaceAll("-", ".") || "5";
      return `Claude Sonnet ${version}`;
    }
    if (normalized.includes("fable")) return "Claude Fable 5";
  }
  if (normalized.startsWith("gpt-")) {
    return normalized
      .split("-")
      .map((part, index) => (index === 0 ? part.toUpperCase() : part[0]?.toUpperCase() + part.slice(1)))
      .join(" ");
  }
  return model;
}

function friendlyEffort(effort: string) {
  if (effort === "xhigh") return "Extra high";
  if (effort === "ultra") return "Ultra";
  return effort ? effort[0].toUpperCase() + effort.slice(1) : "CLI default";
}

function effortIndex(effort: string, levels: string[]) {
  return Math.max(0, levels.indexOf(effort || "medium"));
}

function effortStyle(effort: string, levels: string[]) {
  const index = effortIndex(effort, levels);
  return { "--effort-progress": `${(index / Math.max(1, levels.length - 1)) * 100}%` } as CSSProperties;
}

function shortVersion(version?: string) {
  return version?.replace(/^codex-cli\s*/i, "").replace(/\s*\(Claude Code\)$/i, "") || "—";
}

function displayTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function OutcomeCard({
  outcome,
  status,
  compact = false,
}: {
  outcome: Outcome | null;
  status: SessionStatus;
  compact?: boolean;
}) {
  return (
    <section
      className={`outcome-card${compact ? " compact-outcome" : ""}`}
      aria-labelledby={compact ? "outcome-title-compact" : "outcome-title"}
    >
      <div className="outcome-heading">
        <div>
          <span className="context-label">COMPLETION BRIEF</span>
          <h2 id={compact ? "outcome-title-compact" : "outcome-title"}>Outcome</h2>
        </div>
        {outcome?.status === "available" && (
          <span className={`consensus-badge ${outcome.consensus ? "" : "split"}`}>
            {outcome.consensus ? "Consensus" : "No consensus"}
          </span>
        )}
      </div>

      {status === "synthesizing" && !outcome && (
        <div className="outcome-pending" role="status">
          <span className="thinking-line" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          Codex is turning the completed discussion into decisions and next actions.
        </div>
      )}

      {!outcome && !TERMINAL_STATUSES.has(status) && status !== "synthesizing" && (
        <p className="outcome-empty">
          A completion brief will appear here after the agents finish.
        </p>
      )}

      {!outcome && TERMINAL_STATUSES.has(status) && (
        <p className="outcome-empty">
          The discussion ended before a completion brief could be produced.
        </p>
      )}

      {outcome?.status === "unavailable" && (
        <p className="outcome-unavailable" role="status">{outcome.message}</p>
      )}

      {outcome?.status === "available" && (
        <>
          <div className="outcome-section">
            <span>Decision</span>
            <p>{outcome.decision}</p>
          </div>
          <div className="outcome-section">
            <span>Why</span>
            <p>{outcome.rationale}</p>
          </div>
          <div className="outcome-section">
            <span>Next actions</span>
            {outcome.actions.length ? (
              <ol className="outcome-actions">
                {outcome.actions.map((action, index) => (
                  <li key={`${action.owner}-${index}`}>
                    <strong>{action.owner}</strong>
                    <p>{action.text}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p>No actions were agreed.</p>
            )}
          </div>
          {outcome.openQuestions.length > 0 && (
            <div className="outcome-section">
              <span>Open questions</span>
              <ul className="outcome-questions">
                {outcome.openQuestions.map((question, index) => (
                  <li key={index}>{question}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {outcome?.coverage.truncated && (
        <p className="coverage-note">
          Partial brief: every turn is represented, but long messages were shortened for synthesis.
        </p>
      )}
    </section>
  );
}

export default function Home() {
  const [bridgeUrl, setBridgeUrl] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_BRIDGE;
    const queryBridge = new URLSearchParams(window.location.search).get("bridge");
    return queryBridge || sessionStorage.getItem("roundtable.bridge") || DEFAULT_BRIDGE;
  });
  const [token, setToken] = useState(() => {
    if (typeof window === "undefined") return "";
    const queryToken = new URLSearchParams(window.location.search).get("token");
    return queryToken || sessionStorage.getItem("roundtable.token") || "";
  });
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<Message[]>(SAMPLE_MESSAGES);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [pendingSteering, setPendingSteering] = useState<Message[]>([]);
  const [historyWarning, setHistoryWarning] = useState("");
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [viewingHistory, setViewingHistory] = useState(false);
  const [historyPreference, setHistoryPreference] = useState<"unset" | "on" | "off">(() => {
    if (typeof window === "undefined") return "unset";
    const saved = localStorage.getItem("roundtable.history");
    return saved === "on" || saved === "off" ? saved : "unset";
  });
  const [isPreview, setIsPreview] = useState(true);
  const [speaker, setSpeaker] = useState<"codex" | "claude" | null>(null);
  const [turn, setTurn] = useState(0);
  const [totalTurns, setTotalTurns] = useState(6);
  const [projectPath, setProjectPath] = useState("");
  const [topic, setTopic] = useState(
    "Review this project’s architecture and agree on the highest-leverage next steps.",
  );
  const [rounds, setRounds] = useState("3");
  const [codexModel, setCodexModel] = useState("");
  const [claudeModel, setClaudeModel] = useState("");
  const [codexEffort, setCodexEffort] = useState("");
  const [claudeEffort, setClaudeEffort] = useState("");
  const [steering, setSteering] = useState("");
  const [connectOpen, setConnectOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const streamRef = useRef<EventSource | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);

  const connected = Boolean(health?.ok);
  const active = status === "running";
  const busy = active || status === "synthesizing";
  const canSteer = active && turn < totalTurns - 1;
  const codexEfforts = health?.models.codex.efforts?.length
    ? health.models.codex.efforts
    : DEFAULT_EFFORT_LEVELS;
  const claudeEfforts = health?.models.claude.efforts?.length
    ? health.models.claude.efforts
    : DEFAULT_EFFORT_LEVELS;

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
      const normalizedBridge = nextBridge.replace(/\/$/, "");
      const response = await fetch(`${normalizedBridge}/health`, {
        headers: { Authorization: `Bearer ${nextToken.trim()}` },
      });
      if (!response.ok) throw new Error("The bridge key was not accepted.");
      const data = (await response.json()) as BridgeHealth;
      setHealth(data);
      setToken(nextToken.trim());
      setBridgeUrl(normalizedBridge);
      sessionStorage.setItem("roundtable.bridge", normalizedBridge);
      sessionStorage.setItem("roundtable.token", nextToken.trim());
      if (!projectPath) setProjectPath(data.defaultProject);
      setCodexModel((current) => current || data.models?.codex.configured || "");
      setClaudeModel((current) => current || data.models?.claude.configured || "");
      setCodexEffort((current) => current || data.models?.codex.effort || "medium");
      setClaudeEffort((current) => current || data.models?.claude.effort || "medium");
      setStatus((current) => (current === "connecting" ? "idle" : current));
      setConnectOpen(false);
      if (data.history?.available) {
        await loadHistory(nextToken.trim(), normalizedBridge);
      }
      const savedSessionId = sessionStorage.getItem("roundtable.sessionId");
      if (savedSessionId) {
        await recoverSession(savedSessionId, nextToken.trim(), normalizedBridge);
      }
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
    const initialToken = queryToken || token;
    const initialBridge = queryBridge || bridgeUrl;

    if (queryToken || queryBridge) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    const connectTimer = initialToken
      ? window.setTimeout(() => void connect(initialToken, initialBridge), 0)
      : undefined;

    return () => {
      if (connectTimer !== undefined) window.clearTimeout(connectTimer);
      streamRef.current?.close();
    };
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

  function applySnapshot(snapshot: SessionSnapshot, archived = Boolean(snapshot.archived)) {
    setConnectionError("");
    setSessionId(snapshot.id);
    setProjectPath(snapshot.projectPath);
    setTopic(snapshot.topic);
    setCodexModel(snapshot.codexModel);
    setClaudeModel(snapshot.claudeModel);
    setCodexEffort(snapshot.codexEffort);
    setClaudeEffort(snapshot.claudeEffort);
    setMessages(snapshot.messages);
    setOutcome(snapshot.outcome);
    setPendingSteering(snapshot.pendingSteering || []);
    setHistoryWarning(snapshot.historyWarning || "");
    setViewingHistory(archived);
    setIsPreview(false);
    setTotalTurns(snapshot.totalTurns);
    setRounds(String(snapshot.totalTurns / 2));
    setTurn(snapshot.lastStatus.turn ?? snapshot.completedTurns);
    setSpeaker(snapshot.lastStatus.speaker || null);
    setStatus(snapshot.lastStatus.status);
  }

  async function recoverSession(id: string, recoveryToken = token, recoveryBridge = bridgeUrl) {
    const response = await fetch(`${recoveryBridge}/sessions/${id}`, {
      headers: { Authorization: `Bearer ${recoveryToken}` },
    });
    if (response.status === 404) {
      const historyResponse = await fetch(`${recoveryBridge}/history/${id}`, {
        headers: { Authorization: `Bearer ${recoveryToken}` },
      });
      sessionStorage.removeItem("roundtable.sessionId");
      if (historyResponse.ok) {
        applySnapshot((await historyResponse.json()) as SessionSnapshot, true);
        return;
      }
      setConnectionError("The previous discussion is no longer available.");
      setStatus("idle");
      return;
    }
    if (!response.ok) throw new Error("The previous discussion could not be restored.");
    const snapshot = (await response.json()) as SessionSnapshot;
    applySnapshot(snapshot);
    if (
      snapshot.phase === "running" ||
      snapshot.phase === "starting" ||
      snapshot.phase === "stopping" ||
      snapshot.phase === "synthesizing"
    ) {
      await openStream(id, recoveryToken, recoveryBridge);
    }
  }

  async function openStream(id: string, streamToken = token, streamBridge = bridgeUrl) {
    streamRef.current?.close();
    const ticketResponse = await fetch(`${streamBridge}/sessions/${id}/ticket`, {
      method: "POST",
      headers: { Authorization: `Bearer ${streamToken}` },
    });
    if (!ticketResponse.ok) throw new Error("Could not open the live discussion stream.");
    const { ticket } = (await ticketResponse.json()) as { ticket: string };
    const stream = new EventSource(`${streamBridge}/sessions/${id}/events?ticket=${encodeURIComponent(ticket)}`);
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
      if (update.type === "session.outcome") {
        setOutcome(update.outcome);
        return;
      }
      if (update.type === "session.history") {
        setHistoryWarning(update.warning);
        return;
      }
      setStatus(update.status);
      setSpeaker(update.speaker || null);
      if (typeof update.turn === "number") setTurn(update.turn);
      if (typeof update.totalTurns === "number") setTotalTurns(update.totalTurns);
      if (TERMINAL_STATUSES.has(update.status)) {
        setSpeaker(null);
        stream.close();
        void loadHistory(streamToken, streamBridge);
      }
    };
    stream.onerror = () => {
      if (streamRef.current !== stream) return;
      stream.close();
      setConnectionError("The live stream was interrupted. Reconnecting…");
      window.setTimeout(() => {
        void recoverSession(id, streamToken, streamBridge).catch(() => {
          sessionStorage.removeItem("roundtable.sessionId");
          setStatus("error");
          setConnectionError("The discussion could not be reconnected.");
        });
      }, 900);
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
        codexModel: codexModel.trim(),
        claudeModel: claudeModel.trim(),
        codexEffort,
        claudeEffort,
        keepHistory: historyPreference === "on",
      }),
    });
    const data = (await response.json()) as {
      id?: string;
      error?: string;
      historyWarning?: string;
    };
    if (!response.ok || !data.id) {
      setConnectionError(data.error || "The discussion could not be started.");
      return;
    }
    setMessages([]);
    setOutcome(null);
    setPendingSteering([]);
    setHistoryWarning(data.historyWarning || "");
    setViewingHistory(false);
    setIsPreview(false);
    setSessionId(data.id);
    sessionStorage.setItem("roundtable.sessionId", data.id);
    setStatus("running");
    setTurn(0);
    setTotalTurns(Number(rounds) * 2);
    await openStream(data.id);
  }

  async function loadHistory(historyToken = token, historyBridge = bridgeUrl) {
    if (!historyToken) return;
    setHistoryLoading(true);
    try {
      const response = await fetch(`${historyBridge}/history`, {
        headers: { Authorization: `Bearer ${historyToken}` },
      });
      if (!response.ok) throw new Error("Could not load local history.");
      const data = (await response.json()) as {
        enabled: boolean;
        records: HistoryRecord[];
      };
      setHistoryRecords(data.records);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Could not load local history.");
    } finally {
      setHistoryLoading(false);
    }
  }

  function chooseHistoryPreference(value: "on" | "off") {
    localStorage.setItem("roundtable.history", value);
    setHistoryPreference(value);
  }

  async function openHistoryRecord(id: string) {
    setHistoryLoading(true);
    try {
      const response = await fetch(`${bridgeUrl}/history/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("That archived discussion is unavailable.");
      applySnapshot((await response.json()) as SessionSnapshot, true);
      setHistoryOpen(false);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Could not open history.");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function deleteHistoryRecord(record: HistoryRecord) {
    if (!window.confirm(`Delete “${record.topic}” from local history?`)) return;
    const response = await fetch(`${bridgeUrl}/history/${record.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      setConnectionError("The archived discussion could not be deleted.");
      return;
    }
    if (viewingHistory && sessionId === record.id) {
      setViewingHistory(false);
      setIsPreview(true);
      setMessages(SAMPLE_MESSAGES);
      setOutcome(null);
      setStatus("idle");
    }
    await loadHistory();
  }

  async function clearHistory() {
    if (!window.confirm("Clear every locally archived Roundtable discussion?")) return;
    const response = await fetch(`${bridgeUrl}/history`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ confirm: "clear" }),
    });
    if (!response.ok) {
      setConnectionError("Local history could not be cleared.");
      return;
    }
    setHistoryRecords([]);
    if (viewingHistory) {
      setViewingHistory(false);
      setIsPreview(true);
      setMessages(SAMPLE_MESSAGES);
      setOutcome(null);
      setStatus("idle");
    }
  }

  async function sendSteering(event: FormEvent) {
    event.preventDefault();
    if (!sessionId || !steering.trim() || !canSteer) return;
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
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setConnectionError(data.error || "Your steering note could not be queued.");
    }
  }

  async function stopDiscussion() {
    if (!sessionId) return;
    await fetch(`${bridgeUrl}/sessions/${sessionId}/stop`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  function transcriptMarkdown() {
    const lines = [
      "# Roundtable transcript",
      "",
      `**Project:** ${projectPath}`,
      `**Goal:** ${topic}`,
      `**Codex:** ${friendlyModelName("codex", codexModel)} · ${friendlyEffort(codexEffort)}`,
      `**Claude:** ${friendlyModelName("claude", claudeModel)} · ${friendlyEffort(claudeEffort)}`,
      "",
    ];
    if (outcome?.status === "available") {
      lines.push(
        "# Outcome",
        "",
        `**Consensus:** ${outcome.consensus ? "Yes" : "No"}`,
        "",
        "## Decision",
        "",
        outcome.decision,
        "",
        "## Rationale",
        "",
        outcome.rationale,
        "",
        "## Next actions",
        "",
      );
      if (outcome.actions.length) {
        outcome.actions.forEach((action, index) => {
          lines.push(`${index + 1}. **${action.owner}:** ${action.text}`);
        });
      } else {
        lines.push("No actions were agreed.");
      }
      lines.push("", "## Open questions", "");
      if (outcome.openQuestions.length) {
        outcome.openQuestions.forEach((question) => lines.push(`- ${question}`));
      } else {
        lines.push("None.");
      }
      if (outcome.coverage.truncated) {
        lines.push(
          "",
          "> Partial brief: every turn is represented, but long messages were shortened for synthesis.",
        );
      }
      lines.push("", "---", "");
    } else if (outcome?.status === "unavailable") {
      lines.push("# Outcome", "", outcome.message, "", "---", "");
    }
    for (const message of messages) {
      lines.push(
        `## ${message.author}${message.round ? ` — Round ${message.round}` : ""}`,
        "",
        [
          displayTime(message.at),
          message.model
            ? friendlyModelName(message.role === "claude" ? "claude" : "codex", message.model)
            : "",
          message.effort ? friendlyEffort(message.effort) : "",
        ]
          .filter(Boolean)
          .join(" · "),
        "",
        message.body,
        "",
      );
    }
    if (pendingSteering.length) {
      lines.push(
        "# Queued, never delivered",
        "",
        "These steering notes were saved separately and were never added to an agent turn.",
        "",
      );
      pendingSteering.forEach((message) => lines.push(`- ${message.body}`));
      lines.push("");
    }
    return lines.join("\n");
  }

  async function copyTranscript() {
    await navigator.clipboard.writeText(transcriptMarkdown());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  function downloadTranscript() {
    const blob = new Blob([transcriptMarkdown()], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `roundtable-${new Date().toISOString().slice(0, 10)}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
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
          <span className={`live-dot ${busy ? "is-live" : ""}`} />
          {status === "synthesizing"
            ? "SYNTHESIZING OUTCOME"
            : active
              ? `LIVE · TURN ${turn + 1}`
              : isPreview
                ? "PRODUCT PREVIEW"
                : status.toUpperCase()}
        </div>
        <div className="topbar-actions">
          <button
            className="history-button"
            onClick={() => {
              setHistoryOpen((value) => !value);
              if (!historyOpen) void loadHistory();
            }}
            type="button"
            disabled={!connected}
          >
            <History size={15} />
            History{historyRecords.length ? ` · ${historyRecords.length}` : ""}
          </button>
          <button
            className={`connection-button ${connected ? "connected" : ""}`}
            onClick={() => setConnectOpen((value) => !value)}
            type="button"
          >
            {connected ? <Wifi size={15} /> : <WifiOff size={15} />}
            {connected ? "Bridge connected" : "Connect bridge"}
          </button>
        </div>
      </header>

      {connected && health?.history?.available && historyPreference === "unset" && (
        <section className="history-consent" aria-label="Local discussion history">
          <div>
            <strong>Keep discussions locally?</strong>
            <p>
              Save transcripts and Outcomes on this Mac so they survive restarts. Nothing is stored
              in the project or cloud, and bridge credentials are never written.
            </p>
          </div>
          <button type="button" onClick={() => chooseHistoryPreference("on")}>
            Keep locally
          </button>
          <button type="button" onClick={() => chooseHistoryPreference("off")}>
            Not now
          </button>
        </section>
      )}

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

      {historyOpen && (
        <section className="history-drawer" aria-label="Recent discussions">
          <div className="history-drawer-header">
            <div>
              <p className="eyebrow">LOCAL ARCHIVE</p>
              <h2>Recent discussions</h2>
            </div>
            <button
              className="drawer-close"
              type="button"
              onClick={() => setHistoryOpen(false)}
              aria-label="Close recent discussions"
            >
              <X size={17} />
            </button>
          </div>
          <p className="history-privacy">
            Stored only in your user data folder with owner-only permissions. Retained for up to{" "}
            {health?.history?.retention.maxDays || 30} days or{" "}
            {health?.history?.retention.maxRecords || 50} discussions.
          </p>
          {health?.history?.available ? (
            <div className="history-preference">
              <span>Archive new discussions</span>
              <button
                type="button"
                className={historyPreference === "on" ? "selected" : ""}
                onClick={() => chooseHistoryPreference("on")}
              >
                On
              </button>
              <button
                type="button"
                className={historyPreference !== "on" ? "selected" : ""}
                onClick={() => chooseHistoryPreference("off")}
              >
                Off
              </button>
            </div>
          ) : (
            <p className="history-disabled">Local history is disabled by the bridge administrator.</p>
          )}

          <div className="history-list">
            {historyLoading && <p className="history-empty">Loading local history…</p>}
            {!historyLoading && historyRecords.length === 0 && (
              <p className="history-empty">No archived discussions yet.</p>
            )}
            {historyRecords.map((record) => (
              <article className="history-record" key={record.id}>
                <button
                  className="history-record-open"
                  type="button"
                  onClick={() => void openHistoryRecord(record.id)}
                >
                  <span className={`history-status ${record.status}`}>{record.status}</span>
                  <strong>{record.topic}</strong>
                  <small>
                    {record.projectName} · {new Date(record.updatedAt).toLocaleDateString()} ·{" "}
                    {record.messageCount} messages
                  </small>
                  {record.historyWarning && <em>History incomplete</em>}
                </button>
                <button
                  className="history-delete"
                  type="button"
                  onClick={() => void deleteHistoryRecord(record)}
                  aria-label={`Delete ${record.topic}`}
                >
                  <Trash2 size={14} />
                </button>
              </article>
            ))}
          </div>

          <div className="history-drawer-actions">
            <button type="button" onClick={() => setHistoryOpen(false)}>
              New discussion
            </button>
            <button
              className="clear-history"
              type="button"
              onClick={() => void clearHistory()}
              disabled={!historyRecords.length}
            >
              Clear history
            </button>
          </div>
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

            <button className="primary" type="submit" disabled={busy}>
              {busy ? <Radio size={17} /> : <Sparkles size={17} />}
              {status === "synthesizing"
                ? "Building outcome"
                : active
                  ? "Discussion running"
                  : "Start the roundtable"}
              {!busy && <ArrowRight size={17} />}
            </button>
          </form>

          <div className="agent-stack">
            <p className="eyebrow">PARTICIPANTS</p>
            <div className="agent-row codex-agent">
              <span className="agent-glyph codex-glyph">C</span>
              <div className="agent-copy">
                <strong>Codex CLI</strong>
                <small>{connected ? shortVersion(health?.codex.version) : "Waiting for bridge"}</small>
                <label className="model-picker">
                  <span>MODEL</span>
                  <div className="model-input-stack">
                    <output>{friendlyModelName("codex", codexModel)}</output>
                    <input
                      list="codex-model-options"
                      value={codexModel}
                      onChange={(event) => setCodexModel(event.target.value)}
                      placeholder="CLI default"
                      disabled={busy}
                      aria-label="Codex model"
                    />
                  </div>
                </label>
                <label className="effort-picker">
                  <span className="effort-heading">
                    <span>REASONING</span>
                    <output>{friendlyEffort(codexEffort || "medium")}</output>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max={codexEfforts.length - 1}
                    step="1"
                    value={effortIndex(codexEffort, codexEfforts)}
                    onChange={(event) => setCodexEffort(codexEfforts[Number(event.target.value)])}
                    disabled={busy}
                    aria-label="Codex reasoning effort"
                    style={effortStyle(codexEffort, codexEfforts)}
                  />
                </label>
              </div>
              <span className={`presence ${health?.codex.available ? "online" : ""}`} />
            </div>
            <div className="agent-row claude-agent">
              <span className="agent-glyph claude-glyph">A</span>
              <div className="agent-copy">
                <strong>Claude CLI</strong>
                <small>{connected ? shortVersion(health?.claude.version) : "Waiting for bridge"}</small>
                <label className="model-picker">
                  <span>MODEL</span>
                  <div className="model-input-stack">
                    <output>{friendlyModelName("claude", claudeModel)}</output>
                    <input
                      list="claude-model-options"
                      value={claudeModel}
                      onChange={(event) => setClaudeModel(event.target.value)}
                      placeholder="CLI default"
                      disabled={busy}
                      aria-label="Claude model"
                    />
                  </div>
                </label>
                <label className="effort-picker">
                  <span className="effort-heading">
                    <span>REASONING</span>
                    <output>{friendlyEffort(claudeEffort || "medium")}</output>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max={claudeEfforts.length - 1}
                    step="1"
                    value={effortIndex(claudeEffort, claudeEfforts)}
                    onChange={(event) => setClaudeEffort(claudeEfforts[Number(event.target.value)])}
                    disabled={busy}
                    aria-label="Claude reasoning effort"
                    style={effortStyle(claudeEffort, claudeEfforts)}
                  />
                </label>
              </div>
              <span className={`presence ${health?.claude.available ? "online" : ""}`} />
            </div>
            <datalist id="codex-model-options">
              {health?.models.codex.configured && (
                <option value={health.models.codex.configured}>Configured default</option>
              )}
            </datalist>
            <datalist id="claude-model-options">
              {health?.models.claude.configured && (
                <option value={health.models.claude.configured}>Configured default</option>
              )}
              <option value="claude-opus-5">Claude Opus 5</option>
              <option value="claude-sonnet-5">Claude Sonnet 5</option>
              <option value="claude-fable-5">Claude Fable 5</option>
            </datalist>
            <p className="model-hint">
              Model and reasoning choices lock when the room starts.
            </p>
          </div>
        </aside>

        <section className="conversation-panel">
          <div className="conversation-header">
            <div>
              <p className="eyebrow">
                {isPreview
                  ? "CONVERSATION PREVIEW"
                  : viewingHistory
                    ? "ARCHIVED DISCUSSION"
                    : "PROJECT ROOM"}
              </p>
              <h1>Two agents. One project.<br />You set the direction.</h1>
            </div>
            <div className="conversation-actions">
              {!isPreview && messages.length > 0 && (
                <>
                  <button className="utility-button" type="button" onClick={copyTranscript}>
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <button className="utility-button" type="button" onClick={downloadTranscript}>
                    <Download size={15} />
                    Export
                  </button>
                </>
              )}
              {busy && (
                <button className="stop-button" type="button" onClick={stopDiscussion}>
                  <CircleStop size={16} />
                  {status === "synthesizing" ? "Skip brief" : "Stop"}
                </button>
              )}
            </div>
          </div>

          <div className="progress-rail" aria-label={`Discussion progress ${progress}%`}>
            <span style={{ width: `${progress}%` }} />
          </div>

          <div className="mobile-outcome">
            <OutcomeCard outcome={outcome} status={status} compact />
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
                      {message.model
                        ? ` · ${friendlyModelName(message.role === "claude" ? "claude" : "codex", message.model)}`
                        : ""}
                      {message.effort ? ` · ${friendlyEffort(message.effort)}` : ""}
                    </small>
                  </div>
                </div>
                <p>{message.body}</p>
              </article>
            ))}
            {pendingSteering.length > 0 && (
              <section className="undelivered-steering" aria-labelledby="undelivered-title">
                <span className="human-pulse" />
                <div>
                  <h2 id="undelivered-title">Queued, never delivered</h2>
                  <p>
                    The bridge stopped before these notes reached another agent, so they are not
                    part of the shared transcript.
                  </p>
                  <ul>
                    {pendingSteering.map((message) => (
                      <li key={message.id}>{message.body}</li>
                    ))}
                  </ul>
                </div>
              </section>
            )}
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
                  canSteer
                    ? "Add a priority, correction, or question…"
                    : status === "synthesizing"
                      ? "The discussion is complete while Codex builds the brief…"
                    : active
                      ? "Final turn—there is no next agent to steer…"
                    : "Start a live discussion to add your voice…"
                }
                rows={2}
                disabled={!canSteer}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <button type="submit" disabled={!canSteer || !steering.trim()} aria-label="Send steering note">
                <Send size={18} />
              </button>
            </div>
            <small>⌘ ENTER TO SEND · QUEUED AT THE NEXT TURN BOUNDARY</small>
          </form>
        </section>

        <aside className="context-panel">
          <div className="panel-heading">
            <p className="eyebrow">ROOM CONTEXT</p>
            <span className="step-count">02</span>
          </div>

          <OutcomeCard outcome={outcome} status={status} />

          {historyWarning && (
            <section className="history-warning" role="status">
              <History size={15} />
              <p>{historyWarning}</p>
            </section>
          )}

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
            <span className="context-label">MODEL ROUTING</span>
            <dl className="model-routing">
              <div>
                <dt>Codex</dt>
                <dd>
                  {friendlyModelName("codex", codexModel)} · {friendlyEffort(codexEffort || "medium")}
                </dd>
              </div>
              <div>
                <dt>Claude</dt>
                <dd>
                  {friendlyModelName("claude", claudeModel)} · {friendlyEffort(claudeEffort || "medium")}
                </dd>
              </div>
            </dl>
          </section>

          <section className="context-block">
            <span className="context-label">SAFETY BOUNDARY</span>
            <div className="safety-note">
              <span className="safe-dot" />
              <p>
                Codex runs in a read-only sandbox. Claude runs in safe mode with only Read, Glob,
                and Grep
                {health?.projectWriteGuard
                  ? ", plus a macOS guard that denies writes inside the selected project"
                  : ""}.
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
