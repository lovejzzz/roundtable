"use client";

import {
  ArrowRight,
  Check,
  CircleStop,
  Copy,
  Download,
  FileText,
  FolderOpen,
  History,
  KeyRound,
  Paperclip,
  Plus,
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
import {
  ChangeEvent,
  CSSProperties,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  autoScrollBehavior,
  livenessDetailText,
  liveStatusText,
  pendingSteeringPresentation,
} from "../lib/live-status.mjs";
import {
  RecoveryHttpError,
  ownsSessionGeneration,
  recoveryDelayMs,
  recoveryFailureKind,
} from "../lib/stream-recovery.mjs";

type AgentRole = "codex" | "claude" | "antigravity";
type Speaker = AgentRole | "human";

type PromptAttachment = {
  id: string;
  name: string;
  mediaType: string;
  size: number;
  path?: string;
  contentBase64?: string;
};

type ReportedCheck = {
  command: string;
  status: "passed" | "failed" | "blocked";
  summary: string;
  exitCode?: number;
  round?: number;
  provenance?: "agent-reported" | "bridge-broker";
  attachmentManifestId?: string;
};

type Message = {
  id: string;
  author: string;
  role: Speaker;
  body: string;
  at: string;
  round?: number;
  model?: string;
  effort?: string;
  checks?: ReportedCheck[];
  stage?: "sealed" | "cross-examination";
  context?: {
    stage: "sealed" | "cross-examination";
    inputHash: string;
    coverage: OutcomeCoverage;
  };
};

type OutcomeCoverage = {
  truncated: boolean;
  includedCharacters: number;
  totalCharacters: number;
  messageCount: number;
  includedMessageCount?: number;
  omittedLabels?: string[];
  shortenedLabels?: string[];
  maxCharacters?: number;
  presentationOrder?: string[];
  dissentCount?: number;
};

type SynthesisAttempt = {
  role: AgentRole;
  author: "Codex" | "Claude" | "Antigravity";
  status: "completed" | "failed";
  error?: string;
};

type BriefAuditReview = {
  role: AgentRole;
  author: "Codex" | "Claude" | "Antigravity";
  status: "completed" | "unavailable";
  at: string;
  revise: boolean;
  concerns: {
    summary: string;
    reason: string;
    messageLabels: string[];
  }[];
  message?: string;
};

type DissentItem = {
  id: string;
  author: "Codex" | "Claude" | "Antigravity";
  role: AgentRole;
  at: string;
  messageLabel: string;
  position: "accept" | "reject" | "uncertain";
  summary: string;
  reason: string;
};

type DissentReview = {
  role: AgentRole;
  author: "Codex" | "Claude" | "Antigravity";
  status: "completed" | "unavailable";
  at: string;
  coverage: OutcomeCoverage;
  itemCount?: number;
  message?: string;
};

type DissentJudgment = {
  verdict: "represented" | "missed";
  judgedAt: string;
};

type Outcome =
  | {
      status: "available";
      decision: string;
      rationale: string;
      actions: { owner: "You" | "Codex" | "Claude" | "Antigravity" | "Unassigned"; text: string }[];
      openQuestions: string[];
      consensus: boolean;
      coverage: OutcomeCoverage;
      synthesizedBy: "Codex" | "Claude" | "Antigravity";
      synthesizedRole?: AgentRole;
      synthesisAttempts?: SynthesisAttempt[];
      provisional?: boolean;
      draft?: {
        status: "available";
        decision: string;
        rationale: string;
        actions: { owner: "You" | "Codex" | "Claude" | "Antigravity" | "Unassigned"; text: string }[];
        openQuestions: string[];
        consensus: boolean;
      };
      draftSynthesizedBy?: "Codex" | "Claude" | "Antigravity";
      audit?: {
        reviews: Record<string, BriefAuditReview>;
        concernCount: number;
      };
      revision?: {
        attempted: boolean;
        status: "pending" | "not-needed" | "completed" | "failed" | "skipped";
        revisedBy?: "Codex" | "Claude" | "Antigravity";
        attempts?: SynthesisAttempt[];
      };
    }
  | {
      status: "unavailable";
      reason: "skipped" | "failed" | "stopped";
      message: string;
      coverage: OutcomeCoverage;
      synthesizedBy: "Codex" | "Claude" | "Antigravity" | null;
      synthesisAttempts?: SynthesisAttempt[];
    };

type BridgeHealth = {
  ok: boolean;
  defaultProject: string;
  projectWriteGuard: boolean;
  models: {
    codex: { configured: string; effort: string; efforts: string[]; available?: string[] };
    claude: { configured: string; effort: string; efforts: string[]; available?: string[] };
    antigravity: { configured: string; effort: string; efforts: string[]; available?: string[] };
  };
  codex: { available: boolean; version: string; diagnostic?: string };
  claude: { available: boolean; version: string; diagnostic?: string };
  antigravity: { available: boolean; version: string; diagnostic?: string };
  environmentPolicy?: {
    mode: "role-scoped-allowlist";
    withheldAuthenticationVariables: string[];
  };
  history: {
    available: boolean;
    retention: { maxRecords: number; maxDays: number };
  };
  testSandbox?: {
    codex: boolean;
    claude: boolean;
    antigravity: boolean;
    claudeReason?: string;
  };
};

type FailedTurn = {
  turn: number;
  role: AgentRole;
  safeError: string;
  attempts: number;
  failedAt: string;
  expiresAt: string;
};

type SessionLiveness = {
  role: AgentRole;
  turn: number;
  stage: string;
  state: "preparing" | "request-active" | "process-active" | "process-exited" | "broker-active";
  startedAt: string;
  observedAt: string;
  processStartedAt?: string;
  lastActivityAt?: string;
  timeoutAt?: string;
  endedAt?: string;
};

type SessionEvent =
  | { type: "message"; message: Message }
  | { type: "session.batch"; batch: unknown }
  | { type: "session.audit"; audit: unknown }
  | {
      type: "session.dissent";
      items: DissentItem[];
      review?: DissentReview;
      reviews?: DissentReview[];
    }
  | {
      type: "dissent.judged";
      dissentId: string;
      verdict: DissentJudgment["verdict"];
      judgedAt: string;
    }
  | { type: "session.outcome"; outcome: Outcome }
  | { type: "session.history"; warning: string }
  | { type: "session.liveness"; liveness: SessionLiveness | null }
  | {
      type: "session.status";
      status: SessionStatus;
      speaker?: AgentRole;
      turn?: number;
      totalTurns?: number;
      note?: string;
      stage?: string;
      failedTurn?: FailedTurn | null;
    };

type SessionStatus =
  | "idle"
  | "connecting"
  | "preparing"
  | "running"
  | "failed"
  | "retrying"
  | "reviewing"
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
  attachments?: Omit<PromptAttachment, "id" | "contentBase64">[];
  attachmentManifestId?: string;
  codexModel: string;
  claudeModel: string;
  antigravityModel: string;
  codexEffort: string;
  claudeEffort: string;
  antigravityEffort: string;
  totalTurns: number;
  completedTurns: number;
  messages: Message[];
  outcome: Outcome | null;
  sealedBatch?: unknown;
  briefAudit?: unknown;
  pendingSteering: Message[];
  reviewDissent?: boolean;
  dissent?: DissentItem[];
  dissentReviews?: Record<string, DissentReview>;
  dissentJudgments?: Record<string, DissentJudgment>;
  failedTurn?: FailedTurn | null;
  liveness?: SessionLiveness | null;
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

async function responseError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error || fallback;
  } catch {
    return fallback;
  }
}

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
    checks: [
      {
        command: "npm run test:bridge",
        status: "passed",
        summary: "Focused bridge checks completed.",
        exitCode: 0,
        round: 1,
      },
    ],
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
    author: "Antigravity",
    role: "antigravity",
    at: "10:44",
    round: 1,
    body: "I checked the interface contract against the bridge shape. The next useful move is to expose each CLI’s actual model and effort alongside its messages, then keep those settings locked for the full session so recovered transcripts remain reproducible.",
  },
  {
    id: "sample-4",
    author: "You",
    role: "human",
    at: "10:45",
    body: "Prioritize a usable first version. Keep all three agents in discussion-only mode for now.",
  },
];

const DEFAULT_BRIDGE = "http://127.0.0.1:4317";
const DEFAULT_EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"];
const DEFAULT_TOPIC =
  "Review this project’s architecture and agree on the highest-leverage next steps.";
const MAX_PROMPT_ATTACHMENTS = 5;
const MAX_PROMPT_ATTACHMENT_BYTES = 1024 * 1024;
const MAX_PROMPT_ATTACHMENTS_TOTAL_BYTES = 3 * 1024 * 1024;

function normalizedLaunchRounds(value: string) {
  return ["1", "2", "3", "4", "5"].includes(value) ? value : "3";
}

function encodedModelEffort(model: string) {
  return model.toLowerCase().match(/-(low|medium|high)$/)?.[1] || "";
}

const AGENT_ROLES = ["codex", "claude", "antigravity"] as const;
const AGENT_LABELS: Record<AgentRole, string> = {
  codex: "Codex",
  claude: "Claude",
  antigravity: "Antigravity",
};
const AGENT_GLYPHS: Record<AgentRole, string> = {
  codex: "C",
  claude: "A",
  antigravity: "G",
};

function friendlyModelName(role: AgentRole, model: string) {
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
  if (role === "antigravity" && normalized.startsWith("gemini-")) {
    return normalized
      .replace(/-(low|medium|high)$/, "")
      .split("-")
      .map((part, index) =>
        index === 0 ? "Gemini" : part === "pro" ? "Pro" : part === "flash" ? "Flash" : part[0]?.toUpperCase() + part.slice(1),
      )
      .join(" ");
  }
  return model;
}

function friendlyEffort(effort: string) {
  if (effort === "xhigh") return "Extra high";
  if (effort === "ultra") return "Ultra";
  return effort ? effort[0].toUpperCase() + effort.slice(1) : "CLI default";
}

function attachmentSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileContentBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read “${file.name}”.`));
    reader.onload = () => {
      const result = String(reader.result || "");
      const separator = result.indexOf(",");
      if (separator < 0) {
        reject(new Error(`Could not encode “${file.name}”.`));
        return;
      }
      resolve(result.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
}

function ModelRoute({
  role,
  model,
  effort,
}: {
  role: AgentRole;
  model: string;
  effort: string;
}) {
  return (
    <>
      {friendlyModelName(role, model)} · {friendlyEffort(effort)}
      <small className="routing-exact">
        model: {model || "CLI default"} · effort: {effort || "CLI default"}
      </small>
    </>
  );
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

function reportedCheckCounts(checks: ReportedCheck[]) {
  return (["passed", "failed", "blocked"] as const)
    .map((status) => {
      const count = checks.filter((check) => check.status === status).length;
      return count ? `${count} ${status}` : "";
    })
    .filter(Boolean)
    .join(" · ");
}

function ReportedChecks({ message }: { message: Message }) {
  if (!message.checks?.length) return null;
  const brokeredCount = message.checks.filter(
    (check) => check.provenance === "bridge-broker",
  ).length;
  const agentReportedCount = message.checks.length - brokeredCount;
  return (
    <details className="reported-checks">
      <summary>
        {brokeredCount && !agentReportedCount
          ? "Verified by Roundtable broker"
          : brokeredCount
            ? "Check evidence"
            : `Reported by ${message.author}`}{" "}
        · {reportedCheckCounts(message.checks)}
      </summary>
      <p className="reported-checks-note">
        {brokeredCount
          ? "Brokered checks were executed by Roundtable in a separate local-only network sandbox. Agent-reported checks are identified below."
          : "Agent-reported, not independently verified. This agent's disposable workspace is cumulative across its turns."}
      </p>
      <ul>
        {message.checks.map((check, index) => (
          <li className={`check-${check.status}`} key={`${check.command}-${index}`}>
            <div>
              <strong>{check.status}</strong>
              <span>
                {check.provenance === "bridge-broker"
                  ? "Roundtable broker"
                  : "Agent-reported"}
              </span>
              {check.round && <span>Round {check.round}</span>}
              {Number.isInteger(check.exitCode) && <span>Exit {check.exitCode}</span>}
              {check.attachmentManifestId && (
                <span title={check.attachmentManifestId}>
                  Attachments {check.attachmentManifestId.slice(0, 18)}…
                </span>
              )}
            </div>
            <code>{check.command}</code>
            <p>{check.summary}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

function OutcomeCard({
  outcome,
  status,
  dissent,
  dissentReviews,
  dissentJudgments,
  onJudge,
  compact = false,
}: {
  outcome: Outcome | null;
  status: SessionStatus;
  dissent: DissentItem[];
  dissentReviews: Record<string, DissentReview>;
  dissentJudgments: Record<string, DissentJudgment>;
  onJudge?: (dissentId: string, verdict: DissentJudgment["verdict"]) => void;
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
          <div className="outcome-badges">
            {outcome.provisional && <span className="audit-badge">Draft under audit</span>}
            <span className={`consensus-badge ${outcome.consensus ? "" : "split"}`}>
              {outcome.consensus ? "Consensus" : "No consensus"}
            </span>
          </div>
        )}
      </div>

      {status === "synthesizing" && !outcome && (
        <div className="outcome-pending" role="status">
          <span className="thinking-line" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          A participant is drafting or revising the brief; another participant will take over if
          this synthesis fails.
        </div>
      )}

      {status === "reviewing" && !outcome && (
        <div className="outcome-pending" role="status">
          <span className="thinking-line" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          The agents are independently auditing the draft against labeled transcript evidence.
        </div>
      )}

      {!outcome && status === "failed" && (
        <p className="outcome-empty">
          The transcript is safe. Retry, continue without this participant, or end the paused turn.
        </p>
      )}

      {!outcome && status === "retrying" && (
        <p className="outcome-empty">
          The failed agent turn is being retried with the same discussion context.
        </p>
      )}

      {!outcome &&
        !TERMINAL_STATUSES.has(status) &&
        !["failed", "retrying", "reviewing", "synthesizing"].includes(status) && (
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
          <p className="synthesis-provenance">
            {outcome.revision?.status === "completed"
              ? `Revised once by ${outcome.revision.revisedBy} after ${outcome.audit?.concernCount || 0} audited concern${outcome.audit?.concernCount === 1 ? "" : "s"}.`
              : outcome.provisional
                ? `${outcome.synthesizedBy} drafted this brief; two independent audits are running.`
                : `${outcome.synthesizedBy} produced the brief${outcome.audit ? ` after ${Object.keys(outcome.audit.reviews).length} independent audits` : ""}.`}
          </p>
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
          {outcome.audit && (
            <details className="brief-audit">
              <summary>
                Brief audit · {outcome.audit.concernCount} material concern
                {outcome.audit.concernCount === 1 ? "" : "s"}
              </summary>
              <div>
                {Object.values(outcome.audit.reviews).map((review) => (
                  <section key={review.role}>
                    <strong>{review.author}</strong>
                    <small>{review.status}</small>
                    {review.status === "unavailable" && <p>{review.message}</p>}
                    {review.status === "completed" && review.concerns.length === 0 && (
                      <p>No material correction requested.</p>
                    )}
                    {review.concerns.map((concern, index) => (
                      <article key={`${review.role}-${index}`}>
                        <p>{concern.summary}</p>
                        <small>
                          [{concern.messageLabels.join(", ")}] {concern.reason}
                        </small>
                      </article>
                    ))}
                  </section>
                ))}
              </div>
            </details>
          )}
          {outcome.revision?.status === "completed" && outcome.draft && (
            <details className="brief-audit original-draft">
              <summary>Original preserved draft</summary>
              <div>
                <strong>{outcome.draft.decision}</strong>
                <p>{outcome.draft.rationale}</p>
              </div>
            </details>
          )}
        </>
      )}

      {outcome?.coverage.truncated && (
        <p className="coverage-note">
          Partial brief: every turn is represented, but long messages were shortened for synthesis.
        </p>
      )}

      {Object.keys(dissentReviews).length > 0 && outcome && (
        <div className="dissent-section">
          <div className="dissent-heading">
            <span>Agent-stated dissent</span>
            <small>Summaries · not independently verified</small>
          </div>
          <p className="dissent-intro">
            Mark whether each concern is represented in the completion brief above.
          </p>
          {AGENT_ROLES.map((role) => {
            const review = dissentReviews[role];
            if (!review) return null;
            const agentItems = dissent.filter((item) => item.role === role);
            return (
              <div className="dissent-review" key={role}>
                <div className="dissent-review-status">
                  <strong>{review.author}</strong>
                  <span className={review.status}>{review.status}</span>
                  {review.coverage.truncated && <span>partial input</span>}
                </div>
                {review.status === "unavailable" && (
                  <p className="dissent-review-message">{review.message}</p>
                )}
                {review.status === "completed" && agentItems.length === 0 && (
                  <p className="dissent-review-message">Review completed. No concerns reported.</p>
                )}
                {agentItems.length > 0 && (
                  <ol>
                    {agentItems.map((item) => {
                      const judgment = dissentJudgments[item.id];
                      return (
                        <li key={item.id}>
                          <div className="dissent-meta">
                            <strong>{item.id}</strong>
                            <span>{item.position}</span>
                            <span>[{item.messageLabel}]</span>
                          </div>
                          <p>{item.summary}</p>
                          <small>{item.reason}</small>
                          <div className="dissent-actions" aria-label={`Judge ${item.id}`}>
                            {(["represented", "missed"] as const).map((verdict) => (
                              <button
                                type="button"
                                key={verdict}
                                className={judgment?.verdict === verdict ? "selected" : ""}
                                onClick={() => onJudge?.(item.id, verdict)}
                                disabled={!onJudge}
                              >
                                {verdict === "represented" ? "Represented" : "Missed"}
                              </button>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
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
  const [reviewDissent, setReviewDissent] = useState(false);
  const [dissent, setDissent] = useState<DissentItem[]>([]);
  const [dissentReviews, setDissentReviews] = useState<Record<string, DissentReview>>({});
  const [dissentJudgments, setDissentJudgments] = useState<Record<string, DissentJudgment>>({});
  const [failedTurn, setFailedTurn] = useState<FailedTurn | null>(null);
  const [liveness, setLiveness] = useState<SessionLiveness | null>(null);
  const [statusStage, setStatusStage] = useState("");
  const [statusNote, setStatusNote] = useState("");
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
  const [speaker, setSpeaker] = useState<AgentRole | null>(null);
  const [turn, setTurn] = useState(0);
  const [totalTurns, setTotalTurns] = useState(9);
  const [projectPath, setProjectPath] = useState("");
  const [topic, setTopic] = useState(DEFAULT_TOPIC);
  const [promptAttachments, setPromptAttachments] = useState<PromptAttachment[]>([]);
  const [attachmentManifestId, setAttachmentManifestId] = useState("");
  const [attachmentError, setAttachmentError] = useState("");
  const [rounds, setRounds] = useState("3");
  const [codexModel, setCodexModel] = useState("");
  const [claudeModel, setClaudeModel] = useState("");
  const [antigravityModel, setAntigravityModel] = useState("");
  const [codexEffort, setCodexEffort] = useState("");
  const [claudeEffort, setClaudeEffort] = useState("");
  const [antigravityEffort, setAntigravityEffort] = useState("");
  const [steering, setSteering] = useState("");
  const [roundsToAdd, setRoundsToAdd] = useState("1");
  const [addingRounds, setAddingRounds] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const streamRef = useRef<EventSource | null>(null);
  const recoveryTimerRef = useRef<number | null>(null);
  const sessionGenerationRef = useRef(0);
  const ownedSessionIdRef = useRef("");
  const feedRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

  const connected = Boolean(health?.ok);
  const roomMode: "setup" | "session" | "archive" = viewingHistory
    ? "archive"
    : isPreview
      ? "setup"
      : "session";
  const pendingSteeringCopy = pendingSteeringPresentation({
    terminal: TERMINAL_STATUSES.has(status),
    archived: viewingHistory,
  });
  const active =
    !viewingHistory &&
    (status === "preparing" ||
      status === "running" ||
      status === "failed" ||
      status === "retrying" ||
      status === "reviewing");
  const busy = active || status === "synthesizing";
  const canSteer = !viewingHistory && status === "running" && turn < totalTurns - 1;
  const showCompletionBrief =
    roomMode !== "setup" &&
    (Boolean(outcome) ||
      ["synthesizing", "reviewing", "complete", "stopped", "error", "interrupted"].includes(
        status,
      ));
  const codexEfforts = health?.models.codex.efforts?.length
    ? health.models.codex.efforts
    : DEFAULT_EFFORT_LEVELS;
  const claudeEfforts = health?.models.claude.efforts?.length
    ? health.models.claude.efforts
    : DEFAULT_EFFORT_LEVELS;
  const antigravityEfforts = health?.models.antigravity.efforts?.length
    ? health.models.antigravity.efforts
    : ["low", "medium", "high"];
  const requiredAntigravityEffort = encodedModelEffort(antigravityModel);

  const completedTurnCount = Math.min(Math.max(turn, 0), totalTurns);
  const progress = useMemo(() => {
    if (!totalTurns) return 0;
    return Math.min(100, Math.round((completedTurnCount / totalTurns) * 100));
  }, [completedTurnCount, totalTurns]);
  const lastAgentReplyAuthor =
    messages.filter((message) => message.role !== "human").at(-1)?.author || "";
  const elapsedLivenessSeconds = liveness
    ? Math.max(0, (Date.parse(liveness.observedAt) - Date.parse(liveness.startedAt)) / 1_000)
    : 0;
  const quietLivenessSeconds = liveness
    ? Math.max(
        0,
        (Date.parse(liveness.observedAt) -
          Date.parse(liveness.lastActivityAt || liveness.processStartedAt || liveness.startedAt)) /
          1_000,
      )
    : 0;
  const livenessDetail = livenessDetailText({
    state: liveness?.state || "",
    elapsedSeconds: elapsedLivenessSeconds,
    quietSeconds: quietLivenessSeconds,
    preparationStage: statusStage,
    preparationNote: statusNote,
  });
  const liveStatus = liveStatusText({
    mode: roomMode,
    status,
    speaker: speaker || "",
    failedRole: failedTurn?.role || "",
    turn,
    totalTurns,
    lastReplyAuthor: lastAgentReplyAuthor,
    livenessState: liveness?.state || "",
    elapsedSeconds: elapsedLivenessSeconds,
    quietSeconds: quietLivenessSeconds,
  });

  function clearRecoveryTimer() {
    if (recoveryTimerRef.current === null) return;
    window.clearTimeout(recoveryTimerRef.current);
    recoveryTimerRef.current = null;
  }

  function closeCurrentStream() {
    streamRef.current?.close();
    streamRef.current = null;
  }

  function invalidateSessionOwnership() {
    sessionGenerationRef.current += 1;
    ownedSessionIdRef.current = "";
    clearRecoveryTimer();
    closeCurrentStream();
  }

  function beginSessionOwnership(id: string) {
    invalidateSessionOwnership();
    ownedSessionIdRef.current = id;
    return sessionGenerationRef.current;
  }

  function stillOwnsSession(id: string, generation: number) {
    return ownsSessionGeneration({
      expectedGeneration: generation,
      currentGeneration: sessionGenerationRef.current,
      expectedSessionId: id,
      currentSessionId: ownedSessionIdRef.current,
    });
  }

  async function connect(
    nextToken = token,
    nextBridge = bridgeUrl,
    requestedProjectPath = projectPath,
  ) {
    if (!nextToken.trim()) {
      setConnectionError("Paste the bridge key printed by npm run talk.");
      setConnectOpen(true);
      return;
    }

    setStatus((current) => (current === "running" ? current : "connecting"));
    setConnectionError("");
    const normalizedBridge = nextBridge.replace(/\/$/, "");
    const normalizedToken = nextToken.trim();
    try {
      const response = await fetch(`${normalizedBridge}/health`, {
        headers: { Authorization: `Bearer ${normalizedToken}` },
      });
      if (!response.ok) throw new Error("The bridge key was not accepted.");
      const data = (await response.json()) as BridgeHealth;
      if (normalizedBridge !== bridgeUrl || normalizedToken !== token) {
        invalidateSessionOwnership();
      }
      setHealth(data);
      setToken(normalizedToken);
      setBridgeUrl(normalizedBridge);
      sessionStorage.setItem("roundtable.bridge", normalizedBridge);
      sessionStorage.setItem("roundtable.token", normalizedToken);
      if (!requestedProjectPath) setProjectPath(data.defaultProject);
      setCodexModel((current) => current || data.models?.codex.configured || "");
      setClaudeModel((current) => current || data.models?.claude.configured || "");
      const defaultAntigravityModel = data.models?.antigravity.configured || "";
      setAntigravityModel(
        (current) => current || defaultAntigravityModel,
      );
      setCodexEffort((current) => current || data.models?.codex.effort || "medium");
      setClaudeEffort((current) => current || data.models?.claude.effort || "medium");
      setAntigravityEffort(
        (current) =>
          encodedModelEffort(antigravityModel || defaultAntigravityModel) ||
          current ||
          data.models?.antigravity.effort ||
          "medium",
      );
      setStatus((current) => (current === "connecting" ? "idle" : current));
      setConnectOpen(false);
      if (data.history?.available) {
        await loadHistory(normalizedToken, normalizedBridge);
      }
      const savedSessionId = sessionStorage.getItem("roundtable.sessionId");
      if (savedSessionId) {
        const generation = beginSessionOwnership(savedSessionId);
        void recoverSession(
          savedSessionId,
          normalizedToken,
          normalizedBridge,
          generation,
        );
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
    const queryProject = params.get("project")?.trim() || "";
    const queryTopic = params.get("topic")?.trim() || "";
    const queryRounds = params.get("rounds")?.trim() || "";
    const querySession = params.get("session")?.trim() || "";
    const initialToken = queryToken || token;
    const initialBridge = queryBridge || bridgeUrl;

    if (querySession) {
      sessionStorage.setItem("roundtable.sessionId", querySession);
    }
    if (params.size) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    const connectTimer = window.setTimeout(() => {
      if (queryProject) setProjectPath(queryProject);
      if (queryTopic) setTopic(queryTopic);
      if (queryRounds) setRounds(normalizedLaunchRounds(queryRounds));
      if (querySession) setSessionId(querySession);
      if (initialToken) void connect(initialToken, initialBridge, queryProject);
    }, 0);

    return () => {
      window.clearTimeout(connectTimer);
      invalidateSessionOwnership();
    };
    // Initial bridge discovery runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!feedRef.current || !shouldAutoScrollRef.current) return;
    feedRef.current.scrollTo({
      top: feedRef.current.scrollHeight,
      behavior: autoScrollBehavior(
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      ),
    });
  }, [messages, speaker, outcome, status]);

  function applySnapshot(snapshot: SessionSnapshot, archived = Boolean(snapshot.archived)) {
    setConnectionError("");
    setSessionId(snapshot.id);
    setProjectPath(snapshot.projectPath);
    setTopic(snapshot.topic);
    setPromptAttachments(
      (snapshot.attachments || []).map((attachment, index) => ({
        ...attachment,
        id: `${snapshot.id}-${index}`,
      })),
    );
    setAttachmentManifestId(snapshot.attachmentManifestId || "");
    setAttachmentError("");
    setCodexModel(snapshot.codexModel);
    setClaudeModel(snapshot.claudeModel);
    const restoredAntigravityModel =
      snapshot.antigravityModel || health?.models.antigravity.configured || "";
    setAntigravityModel(restoredAntigravityModel);
    setCodexEffort(snapshot.codexEffort);
    setClaudeEffort(snapshot.claudeEffort);
    setAntigravityEffort(
      encodedModelEffort(restoredAntigravityModel) ||
        snapshot.antigravityEffort ||
        health?.models.antigravity.effort ||
        "medium",
    );
    setMessages(snapshot.messages);
    setOutcome(snapshot.outcome);
    setPendingSteering(snapshot.pendingSteering || []);
    setReviewDissent(Boolean(snapshot.reviewDissent));
    setDissent(snapshot.dissent || []);
    setDissentReviews(snapshot.dissentReviews || {});
    setDissentJudgments(snapshot.dissentJudgments || {});
    setFailedTurn(snapshot.failedTurn || snapshot.lastStatus.failedTurn || null);
    setLiveness(snapshot.liveness || null);
    setStatusStage(snapshot.lastStatus.stage || "");
    setStatusNote(snapshot.lastStatus.note || "");
    setHistoryWarning(snapshot.historyWarning || "");
    setViewingHistory(archived);
    setIsPreview(false);
    setTotalTurns(snapshot.totalTurns);
    setRounds(String(Math.max(1, Math.ceil(snapshot.totalTurns / 3))));
    setTurn(snapshot.lastStatus.turn ?? snapshot.completedTurns);
    setSpeaker(snapshot.lastStatus.speaker || null);
    setStatus(snapshot.lastStatus.status);
  }

  function scheduleRecovery(
    id: string,
    recoveryToken: string,
    recoveryBridge: string,
    generation: number,
    attempt: number,
  ) {
    if (!stillOwnsSession(id, generation)) return;
    clearRecoveryTimer();
    const delay = recoveryDelayMs(attempt);
    setConnectionError(
      `The live stream was interrupted. Reconnecting in ${Math.ceil(delay / 1_000)} seconds…`,
    );
    recoveryTimerRef.current = window.setTimeout(() => {
      recoveryTimerRef.current = null;
      if (!stillOwnsSession(id, generation)) return;
      void recoverSession(
        id,
        recoveryToken,
        recoveryBridge,
        generation,
        attempt + 1,
      );
    }, delay);
  }

  function handleAuthorizationFailure() {
    clearRecoveryTimer();
    closeCurrentStream();
    setHealth(null);
    setStatus("error");
    setConnectionError(
      "The bridge key is no longer valid. Reconnect to restore this discussion.",
    );
    setConnectOpen(true);
  }

  async function recoverSession(
    id: string,
    recoveryToken = token,
    recoveryBridge = bridgeUrl,
    generation = sessionGenerationRef.current,
    attempt = 0,
  ) {
    if (!stillOwnsSession(id, generation)) return;
    try {
      const response = await fetch(`${recoveryBridge}/sessions/${id}`, {
        headers: { Authorization: `Bearer ${recoveryToken}` },
      });
      if (!stillOwnsSession(id, generation)) return;
      if (response.status === 404) {
        const historyResponse = await fetch(`${recoveryBridge}/history/${id}`, {
          headers: { Authorization: `Bearer ${recoveryToken}` },
        });
        if (!stillOwnsSession(id, generation)) return;
        if (historyResponse.ok) {
          const archived = (await historyResponse.json()) as SessionSnapshot;
          if (!stillOwnsSession(id, generation)) return;
          sessionStorage.removeItem("roundtable.sessionId");
          applySnapshot(archived, true);
          return;
        }
        const historyFailure = recoveryFailureKind(historyResponse.status);
        if (historyFailure === "authorization") {
          handleAuthorizationFailure();
          return;
        }
        if (historyFailure !== "missing") {
          throw new RecoveryHttpError(
            historyResponse.status,
            "The previous discussion history could not be restored.",
          );
        }
        sessionStorage.removeItem("roundtable.sessionId");
        invalidateSessionOwnership();
        setConnectionError("The previous discussion is no longer available.");
        setStatus("idle");
        return;
      }
      const failureKind = recoveryFailureKind(response.status);
      if (failureKind === "authorization") {
        handleAuthorizationFailure();
        return;
      }
      if (!response.ok) {
        throw new RecoveryHttpError(
          response.status,
          "The previous discussion could not be restored.",
        );
      }
      const snapshot = (await response.json()) as SessionSnapshot;
      if (!stillOwnsSession(id, generation)) return;
      applySnapshot(snapshot);
      if (
        snapshot.phase === "running" ||
        snapshot.phase === "failed" ||
        snapshot.phase === "retrying" ||
        snapshot.phase === "reviewing" ||
        snapshot.phase === "preparing" ||
        snapshot.phase === "starting" ||
        snapshot.phase === "stopping" ||
        snapshot.phase === "synthesizing"
      ) {
        await openStream(id, recoveryToken, recoveryBridge, generation);
      }
    } catch (error) {
      if (!stillOwnsSession(id, generation)) return;
      const failureKind = recoveryFailureKind(
        error instanceof RecoveryHttpError ? error.status : 0,
      );
      if (failureKind === "authorization") {
        handleAuthorizationFailure();
        return;
      }
      scheduleRecovery(
        id,
        recoveryToken,
        recoveryBridge,
        generation,
        attempt,
      );
    }
  }

  async function openStream(
    id: string,
    streamToken = token,
    streamBridge = bridgeUrl,
    generation = sessionGenerationRef.current,
  ) {
    if (!stillOwnsSession(id, generation)) return;
    closeCurrentStream();
    const ticketResponse = await fetch(`${streamBridge}/sessions/${id}/ticket`, {
      method: "POST",
      headers: { Authorization: `Bearer ${streamToken}` },
    });
    if (!stillOwnsSession(id, generation)) return;
    const failureKind = recoveryFailureKind(ticketResponse.status);
    if (failureKind === "authorization") {
      throw new RecoveryHttpError(
        ticketResponse.status,
        "The bridge key is no longer valid.",
      );
    }
    if (!ticketResponse.ok) {
      throw new RecoveryHttpError(
        ticketResponse.status,
        "Could not open the live discussion stream.",
      );
    }
    const { ticket } = (await ticketResponse.json()) as { ticket: string };
    if (!stillOwnsSession(id, generation)) return;
    const stream = new EventSource(
      `${streamBridge}/sessions/${id}/events?ticket=${encodeURIComponent(ticket)}`,
    );
    if (!stillOwnsSession(id, generation)) {
      stream.close();
      return;
    }
    streamRef.current = stream;
    stream.onmessage = (event) => {
      if (
        streamRef.current !== stream ||
        !stillOwnsSession(id, generation)
      ) {
        stream.close();
        return;
      }
      const update = JSON.parse(event.data) as SessionEvent;
      if (update.type === "message") {
        setMessages((current) =>
          current.some((message) => message.id === update.message.id)
            ? current
            : [...current, update.message],
        );
        setPendingSteering((current) =>
          current.filter((message) => message.id !== update.message.id),
        );
        return;
      }
      if (update.type === "session.batch" || update.type === "session.audit") {
        return;
      }
      if (update.type === "session.dissent") {
        setDissent((current) => {
          const known = new Set(current.map((item) => item.id));
          return [...current, ...update.items.filter((item) => !known.has(item.id))];
        });
        setDissentReviews((current) => {
          const reviews = update.reviews || (update.review ? [update.review] : []);
          return Object.fromEntries([
            ...Object.entries(current),
            ...reviews.map((review) => [review.role, review]),
          ]);
        });
        return;
      }
      if (update.type === "dissent.judged") {
        setDissentJudgments((current) => ({
          ...current,
          [update.dissentId]: {
            verdict: update.verdict,
            judgedAt: update.judgedAt,
          },
        }));
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
      if (update.type === "session.liveness") {
        setLiveness(update.liveness);
        return;
      }
      setStatus(update.status);
      setSpeaker(update.speaker || null);
      setStatusStage(update.stage || "");
      setStatusNote(update.note || "");
      if ("failedTurn" in update) setFailedTurn(update.failedTurn || null);
      if (typeof update.turn === "number") setTurn(update.turn);
      if (typeof update.totalTurns === "number") setTotalTurns(update.totalTurns);
      if (TERMINAL_STATUSES.has(update.status)) {
        setSpeaker(null);
        stream.close();
        if (streamRef.current === stream) streamRef.current = null;
        clearRecoveryTimer();
        void loadHistory(streamToken, streamBridge);
      }
    };
    stream.onerror = () => {
      if (
        streamRef.current !== stream ||
        !stillOwnsSession(id, generation)
      ) {
        stream.close();
        return;
      }
      stream.close();
      streamRef.current = null;
      scheduleRecovery(id, streamToken, streamBridge, generation, 0);
    };
  }

  async function addPromptAttachments(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!files.length) return;
    setAttachmentError("");

    const nextCount = promptAttachments.length + files.length;
    if (nextCount > MAX_PROMPT_ATTACHMENTS) {
      setAttachmentError(`Attach at most ${MAX_PROMPT_ATTACHMENTS} files.`);
      return;
    }
    const existingNames = new Set(promptAttachments.map((item) => item.name.toLowerCase()));
    const newNames = new Set<string>();
    for (const file of files) {
      const key = file.name.toLowerCase();
      if (existingNames.has(key) || newNames.has(key)) {
        setAttachmentError(`Remove the duplicate attachment “${file.name}”.`);
        return;
      }
      if (file.size > MAX_PROMPT_ATTACHMENT_BYTES) {
        setAttachmentError(`“${file.name}” is larger than the 1 MB attachment limit.`);
        return;
      }
      newNames.add(key);
    }
    const nextTotal = [...promptAttachments, ...files].reduce(
      (sum, item) => sum + item.size,
      0,
    );
    if (nextTotal > MAX_PROMPT_ATTACHMENTS_TOTAL_BYTES) {
      setAttachmentError("Prompt attachments exceed the 3 MB combined limit.");
      return;
    }

    try {
      const encoded = await Promise.all(
        files.map(async (file, index) => ({
          id: `${Date.now()}-${index}-${file.name}`,
          name: file.name,
          mediaType: file.type || "application/octet-stream",
          size: file.size,
          contentBase64: await fileContentBase64(file),
        })),
      );
      setPromptAttachments((current) => [...current, ...encoded]);
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "The files could not be read.");
    }
  }

  function removePromptAttachment(id: string) {
    setPromptAttachments((current) => current.filter((attachment) => attachment.id !== id));
    setAttachmentError("");
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
        attachments: promptAttachments.map((attachment) => ({
          name: attachment.name,
          mediaType: attachment.mediaType,
          contentBase64: attachment.contentBase64,
        })),
        rounds: Number(rounds),
        codexModel: codexModel.trim(),
        claudeModel: claudeModel.trim(),
        antigravityModel: antigravityModel.trim(),
        codexEffort,
        claudeEffort,
        antigravityEffort,
        keepHistory: historyPreference === "on",
        reviewDissent,
      }),
    });
    const data = (await response.json()) as {
      id?: string;
      error?: string;
      attachmentManifestId?: string;
      historyWarning?: string;
    };
    if (!response.ok || !data.id) {
      setConnectionError(data.error || "The discussion could not be started.");
      return;
    }
    setMessages([]);
    setPromptAttachments((current) =>
      current.map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        mediaType: attachment.mediaType,
        size: attachment.size,
        path: attachment.path,
      })),
    );
    setAttachmentError("");
    setAttachmentManifestId(data.attachmentManifestId || "");
    setOutcome(null);
    setPendingSteering([]);
    setDissent([]);
    setDissentReviews({});
    setDissentJudgments({});
    setFailedTurn(null);
    setLiveness(null);
    setStatusStage("queued");
    setStatusNote("Preparing isolated role workspaces.");
    setHistoryWarning(data.historyWarning || "");
    setViewingHistory(false);
    setIsPreview(false);
    const generation = beginSessionOwnership(data.id);
    setSessionId(data.id);
    sessionStorage.setItem("roundtable.sessionId", data.id);
    setStatus("preparing");
    setLiveness(null);
    setTurn(0);
    setTotalTurns(Number(rounds) * 3);
    shouldAutoScrollRef.current = true;
    void recoverSession(data.id, token, bridgeUrl, generation);
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

  function resetToSetup() {
    invalidateSessionOwnership();
    sessionStorage.removeItem("roundtable.sessionId");
    const defaultAntigravityModel = health?.models.antigravity.configured || "";
    setSessionId("");
    setMessages(SAMPLE_MESSAGES);
    setOutcome(null);
    setPendingSteering([]);
    setReviewDissent(false);
    setDissent([]);
    setDissentReviews({});
    setDissentJudgments({});
    setFailedTurn(null);
    setLiveness(null);
    setStatusStage("");
    setStatusNote("");
    setHistoryWarning("");
    setViewingHistory(false);
    setIsPreview(true);
    setSpeaker(null);
    setTurn(0);
    setTotalTurns(9);
    setStatus("idle");
    setProjectPath(health?.defaultProject || "");
    setTopic(DEFAULT_TOPIC);
    setPromptAttachments([]);
    setAttachmentManifestId("");
    setAttachmentError("");
    setRounds("3");
    setCodexModel(health?.models.codex.configured || "");
    setClaudeModel(health?.models.claude.configured || "");
    setAntigravityModel(defaultAntigravityModel);
    setCodexEffort(health?.models.codex.effort || "medium");
    setClaudeEffort(health?.models.claude.effort || "medium");
    setAntigravityEffort(
      encodedModelEffort(defaultAntigravityModel) ||
        health?.models.antigravity.effort ||
        "medium",
    );
    setSteering("");
    setConnectionError("");
    shouldAutoScrollRef.current = true;
  }

  async function openHistoryRecord(id: string) {
    setHistoryLoading(true);
    try {
      const response = await fetch(`${bridgeUrl}/history/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("That archived discussion is unavailable.");
      const snapshot = (await response.json()) as SessionSnapshot;
      beginSessionOwnership(id);
      applySnapshot(snapshot, true);
      setHistoryOpen(false);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Could not open history.");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function deleteHistoryRecord(record: HistoryRecord) {
    if (!window.confirm(`Delete “${record.topic}” from local history?`)) return;
    try {
      const response = await fetch(`${bridgeUrl}/history/${record.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        setConnectionError(
          await responseError(response, "The archived discussion could not be deleted."),
        );
        return;
      }
      if (viewingHistory && sessionId === record.id) {
        resetToSetup();
      }
      await loadHistory();
    } catch {
      setConnectionError("The archived discussion could not be deleted.");
    }
  }

  async function clearHistory() {
    if (!window.confirm("Clear every locally archived Roundtable discussion?")) return;
    try {
      const response = await fetch(`${bridgeUrl}/history`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirm: "clear" }),
      });
      if (!response.ok) {
        setConnectionError(await responseError(response, "Local history could not be cleared."));
        return;
      }
      setHistoryRecords([]);
      if (viewingHistory) {
        resetToSetup();
      }
    } catch {
      setConnectionError("Local history could not be cleared.");
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

  async function addDiscussionRounds(event: FormEvent) {
    event.preventDefault();
    if (!sessionId || status !== "running" || viewingHistory || addingRounds) return;
    setAddingRounds(true);
    setConnectionError("");
    try {
      const response = await fetch(`${bridgeUrl}/sessions/${sessionId}/extend`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rounds: Number(roundsToAdd) }),
      });
      const data = (await response.json()) as {
        error?: string;
        totalTurns?: number;
      };
      if (!response.ok || typeof data.totalTurns !== "number") {
        setConnectionError(data.error || "Additional rounds could not be added.");
        return;
      }
      setTotalTurns(data.totalTurns);
      setRounds(String(data.totalTurns / 3));
    } catch {
      setConnectionError("Additional rounds could not be added.");
    } finally {
      setAddingRounds(false);
    }
  }

  async function stopDiscussion() {
    if (!sessionId) return;
    await fetch(`${bridgeUrl}/sessions/${sessionId}/stop`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async function retryFailedTurn() {
    if (!sessionId || status !== "failed" || viewingHistory) return;
    setConnectionError("");
    const response = await fetch(`${bridgeUrl}/sessions/${sessionId}/retry`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setConnectionError(data.error || "The failed turn could not be retried.");
    }
  }

  async function skipFailedTurn() {
    if (!sessionId || status !== "failed" || viewingHistory) return;
    setConnectionError("");
    const response = await fetch(`${bridgeUrl}/sessions/${sessionId}/skip`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setConnectionError(data.error || "The failed turn could not be skipped.");
    }
  }

  async function judgeDissent(
    dissentId: string,
    verdict: DissentJudgment["verdict"],
  ) {
    if (!sessionId) return;
    setConnectionError("");
    const response = await fetch(`${bridgeUrl}/history/${sessionId}/judgment`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ dissentId, verdict }),
    });
    const data = (await response.json()) as {
      error?: string;
      judgment?: DissentJudgment;
    };
    if (!response.ok || !data.judgment) {
      setConnectionError(data.error || "The dissent judgment could not be saved.");
      return;
    }
    setDissentJudgments((current) => ({
      ...current,
      [dissentId]: data.judgment!,
    }));
  }

  function transcriptMarkdown() {
    const lines = [
      "# Roundtable transcript",
      "",
      `**Project:** ${projectPath}`,
      `**Goal:** ${topic}`,
      ...(promptAttachments.length
        ? [
            `**Attachments:** ${promptAttachments
              .map((attachment) => `${attachment.name} (${attachmentSize(attachment.size)})`)
              .join(", ")}`,
            ...(attachmentManifestId
              ? [`**Attachment manifest:** \`${attachmentManifestId}\``]
              : []),
          ]
        : []),
      `**Codex:** ${friendlyModelName("codex", codexModel)} · ${friendlyEffort(codexEffort)}`,
      `**Claude:** ${friendlyModelName("claude", claudeModel)} · ${friendlyEffort(claudeEffort)}`,
      `**Antigravity:** ${friendlyModelName("antigravity", antigravityModel)} · ${friendlyEffort(antigravityEffort)}`,
      `**Dissent check:** ${reviewDissent ? "On" : "Off"}`,
      "",
    ];
    if (outcome?.status === "available") {
      lines.push(
        "# Outcome",
        "",
        `**Consensus:** ${outcome.consensus ? "Yes" : "No"}`,
        `**Synthesized by:** ${outcome.synthesizedBy}`,
        `**Brief audit:** ${outcome.provisional ? "In progress" : `${Object.keys(outcome.audit?.reviews || {}).length} completed or attempted`}`,
        `**Revision:** ${outcome.revision?.status || "Not recorded"}`,
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
      if (outcome.audit) {
        lines.push("", "## Brief audit", "");
        Object.values(outcome.audit.reviews).forEach((review) => {
          lines.push(`### ${review.author} — ${review.status}`, "");
          if (review.message) lines.push(review.message, "");
          if (review.status === "completed" && !review.concerns.length) {
            lines.push("No material correction requested.", "");
          }
          review.concerns.forEach((concern) => {
            lines.push(
              `- **[${concern.messageLabels.join(", ")}] ${concern.summary}** — ${concern.reason}`,
            );
          });
          lines.push("");
        });
      }
      lines.push("", "---", "");
    } else if (outcome?.status === "unavailable") {
      lines.push("# Outcome", "", outcome.message, "", "---", "");
    }
    if (Object.keys(dissentReviews).length) {
      lines.push(
        "# Agent-stated dissent",
        "",
        "Agent-stated summaries; not independently verified.",
        "",
      );
      AGENT_ROLES.forEach((role) => {
        const review = dissentReviews[role];
        if (!review) return;
        lines.push(
          `## ${review.author} review — ${review.status}`,
          "",
          review.coverage.truncated ? "Input coverage: partial excerpts." : "Input coverage: complete.",
          "",
        );
        if (review.status === "unavailable") {
          lines.push(review.message || "Review unavailable.", "");
        }
        const agentItems = dissent.filter((item) => item.role === role);
        if (review.status === "completed" && !agentItems.length) {
          lines.push("Review completed. No concerns reported.", "");
        }
        agentItems.forEach((item) => {
          const judgment = dissentJudgments[item.id];
          lines.push(
            `### ${item.id} · ${item.position} · [${item.messageLabel}]`,
            "",
            item.summary,
            "",
            item.reason,
            "",
            `**Human judgment:** ${judgment?.verdict || "Not judged"}`,
            "",
          );
        });
      });
      lines.push("---", "");
    }
    for (const [index, message] of messages.entries()) {
      lines.push(
        `## [M${index + 1}] ${message.author}${message.round ? ` — Round ${message.round}` : ""}${message.stage === "sealed" ? " · Sealed opening" : message.stage === "cross-examination" ? " · Cross-examination" : ""}`,
        "",
        [
          displayTime(message.at),
          message.model
            ? friendlyModelName(message.role === "human" ? "codex" : message.role, message.model)
            : "",
          message.effort ? friendlyEffort(message.effort) : "",
        ]
          .filter(Boolean)
          .join(" · "),
        "",
        message.body,
        "",
      );
      if (message.context?.coverage.truncated) {
        lines.push(
          `> Partial input: omitted ${message.context.coverage.omittedLabels?.join(", ") || "earlier context"}.`,
          "",
        );
      }
      if (message.checks?.length) {
        const brokered = message.checks.some(
          (check) => check.provenance === "bridge-broker",
        );
        lines.push(
          `### ${brokered ? "Check evidence" : "Agent-reported checks"} — ${message.author}`,
          "",
        );
        lines.push(
          brokered
            ? "> Checks marked Roundtable broker were executed in a separate local-only network sandbox. Other checks are agent-reported."
            : "> These results were reported by the agent, not independently verified. The agent workspace is cumulative across its turns.",
          "",
        );
        message.checks.forEach((check) => {
          lines.push(
            `- **${check.status.toUpperCase()}** · ${
              check.provenance === "bridge-broker"
                ? "Roundtable broker"
                : "Agent-reported"
            } · \`${check.command}\`${
              Number.isInteger(check.exitCode) ? ` (exit ${check.exitCode})` : ""
            }${check.round ? ` · Round ${check.round}` : ""} — ${check.summary}`,
          );
          if (check.attachmentManifestId) {
            lines.push(`  - Attachment manifest: \`${check.attachmentManifestId}\``);
          }
        });
        lines.push("");
      }
    }
    if (pendingSteering.length) {
      lines.push(
        `# ${pendingSteeringCopy.title}`,
        "",
        pendingSteeringCopy.transcriptDescription,
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
            : status === "reviewing"
              ? `${speaker ? AGENT_LABELS[speaker].toUpperCase() : "AGENT"} REVIEWING DISSENT`
            : status === "preparing"
              ? "PREPARING ISOLATED WORKSPACES"
            : status === "failed"
              ? `TURN ${(failedTurn?.turn ?? turn) + 1} PAUSED`
              : status === "retrying"
                ? `RETRYING ${failedTurn ? AGENT_LABELS[failedTurn.role].toUpperCase() : "AGENT"}`
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

      {connected &&
        !sessionId &&
        health?.history?.available &&
        historyPreference === "unset" && (
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
            <button
              type="button"
              onClick={() => {
                resetToSetup();
                setHistoryOpen(false);
              }}
              disabled={busy}
            >
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

      <div className={`workspace-grid ${roomMode}-mode`}>
        <div
          className="visually-hidden"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {liveStatus}
        </div>
        <aside className="setup-panel">
          {roomMode === "setup" ? (
            <>
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

            <div className="field">
              <label htmlFor="discussion-topic">What should they discuss?</label>
              <div className="prompt-window">
                <textarea
                  id="discussion-topic"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  rows={6}
                  required
                />
                {promptAttachments.length > 0 && (
                  <ul className="prompt-attachment-list" aria-label="Prompt attachments">
                    {promptAttachments.map((attachment) => (
                      <li key={attachment.id}>
                        <FileText size={13} />
                        <span>
                          <strong>{attachment.name}</strong>
                          <small>{attachmentSize(attachment.size)}</small>
                        </span>
                        <button
                          type="button"
                          onClick={() => removePromptAttachment(attachment.id)}
                          aria-label={`Remove ${attachment.name}`}
                        >
                          <X size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="prompt-toolbar">
                  <label className="attachment-button">
                    <Paperclip size={14} />
                    Add files
                    <input
                      type="file"
                      multiple
                      disabled={busy || promptAttachments.length >= MAX_PROMPT_ATTACHMENTS}
                      onChange={(event) => void addPromptAttachments(event)}
                      aria-label="Add files to the discussion prompt"
                    />
                  </label>
                  <small>
                    {promptAttachments.length}/{MAX_PROMPT_ATTACHMENTS} · 1 MB each · 3 MB total
                  </small>
                </div>
              </div>
              {attachmentError && (
                <p className="attachment-error" role="alert">
                  {attachmentError}
                </p>
              )}
            </div>

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
            <p className="model-hint">
              Round one is sealed and independent. Later rounds cross-examine the revealed
              positions; every completion draft receives two independent audits and at most one
              revision.
            </p>

            <label className={`dissent-toggle${reviewDissent ? " selected" : ""}`}>
              <input
                type="checkbox"
                checked={reviewDissent}
                disabled={busy || !health?.history?.available}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setReviewDissent(enabled);
                  if (enabled) chooseHistoryPreference("on");
                }}
              />
              <span>
                <strong>Dissent check</strong>
                <small>
                  Adds one review pass per agent and saves your represented/missed judgments locally.
                </small>
              </span>
            </label>

            <button
              className="primary"
              type="submit"
              disabled={busy}
            >
              {busy ? <Radio size={17} /> : <Sparkles size={17} />}
              {status === "synthesizing"
                ? "Building outcome"
                : status === "reviewing"
                  ? "Auditing outcome"
                : status === "preparing"
                  ? "Preparing workspaces"
                : status === "failed"
                  ? "Turn paused"
                  : status === "retrying"
                    ? "Retrying turn"
                : active
                  ? "Discussion running"
                  : connected
                    ? "Start the roundtable"
                    : "Connect bridge to start"}
              {!busy && <ArrowRight size={17} />}
            </button>
          </form>

          <div className="agent-stack">
            <p className="eyebrow">PARTICIPANTS</p>
            <div className="agent-row codex-agent">
              <span className="agent-glyph codex-glyph">C</span>
              <div className="agent-copy">
                <strong>Codex CLI</strong>
                <small>
                  {connected
                    ? health?.codex.available
                      ? shortVersion(health.codex.version)
                      : health?.codex.diagnostic || "Unavailable"
                    : "Waiting for bridge"}
                </small>
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
                <small>
                  {connected
                    ? health?.claude.available
                      ? shortVersion(health.claude.version)
                      : health?.claude.diagnostic || "Unavailable"
                    : "Waiting for bridge"}
                </small>
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
            <div className="agent-row antigravity-agent">
              <span className="agent-glyph antigravity-glyph">G</span>
              <div className="agent-copy">
                <strong>Antigravity CLI</strong>
                <small>
                  {connected
                    ? health?.antigravity.available
                      ? shortVersion(health.antigravity.version)
                      : health?.antigravity.diagnostic || "Unavailable"
                    : "Waiting for bridge"}
                </small>
                <label className="model-picker">
                  <span>MODEL</span>
                  <div className="model-input-stack">
                    <output>{friendlyModelName("antigravity", antigravityModel)}</output>
                    <input
                      list="antigravity-model-options"
                      value={antigravityModel}
                      onChange={(event) => {
                        const model = event.target.value;
                        setAntigravityModel(model);
                        const requiredEffort = encodedModelEffort(model);
                        if (requiredEffort) setAntigravityEffort(requiredEffort);
                      }}
                      placeholder="CLI default"
                      disabled={busy}
                      aria-label="Antigravity model"
                    />
                  </div>
                </label>
                <label className="effort-picker">
                  <span className="effort-heading">
                    <span>REASONING</span>
                    <output>{friendlyEffort(antigravityEffort || "medium")}</output>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max={antigravityEfforts.length - 1}
                    step="1"
                    value={effortIndex(antigravityEffort, antigravityEfforts)}
                    onChange={(event) =>
                      setAntigravityEffort(antigravityEfforts[Number(event.target.value)])
                    }
                    disabled={busy || Boolean(requiredAntigravityEffort)}
                    aria-label="Antigravity reasoning effort"
                    style={effortStyle(antigravityEffort, antigravityEfforts)}
                  />
                </label>
                <p className="routing-disclosure">
                  {requiredAntigravityEffort
                    ? `This model requires ${friendlyEffort(requiredAntigravityEffort)} effort; the slider follows it.`
                    : "Model and effort are sent as separate CLI settings."}
                </p>
              </div>
              <span className={`presence ${health?.antigravity.available ? "online" : ""}`} />
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
            <datalist id="antigravity-model-options">
              {health?.models.antigravity.available?.map((model) => (
                <option value={model} key={model}>
                  {friendlyModelName("antigravity", model)}
                </option>
              ))}
            </datalist>
            <p className="model-hint">
              Model and reasoning choices lock when the room starts.
            </p>
            {health?.environmentPolicy?.mode === "role-scoped-allowlist" && (
              <p className="environment-policy">
                Agent processes receive only role-specific runtime and configuration settings.
                {health.environmentPolicy.withheldAuthenticationVariables.length > 0 && (
                  <>
                    {" "}Withheld ambient credentials:{" "}
                    {health.environmentPolicy.withheldAuthenticationVariables.join(", ")}.
                  </>
                )}
              </p>
            )}
          </div>
            </>
          ) : (
            <div className="session-summary">
              <div className="panel-heading">
                <p className="eyebrow">
                  {roomMode === "archive" ? "ARCHIVED ROOM" : "LIVE ROOM"}
                </p>
                <span className="step-count">{roomMode === "archive" ? "READ ONLY" : "LOCKED"}</span>
              </div>
              <p className="session-summary-topic">{topic}</p>
              {promptAttachments.length > 0 && (
                <div className="session-attachments">
                  <span className="context-label">PROMPT FILES</span>
                  <ul>
                    {promptAttachments.map((attachment) => (
                      <li key={attachment.id}>
                        <FileText size={11} />
                        <span>{attachment.name}</span>
                        <small>{attachmentSize(attachment.size)}</small>
                      </li>
                    ))}
                  </ul>
                  {attachmentManifestId && (
                    <p
                      className="attachment-manifest"
                      title={attachmentManifestId}
                    >
                      Attachment set {attachmentManifestId.slice(0, 18)}…
                    </p>
                  )}
                </div>
              )}
              <dl>
                <div>
                  <dt>Project</dt>
                  <dd>{projectPath.split("/").filter(Boolean).pop() || projectPath}</dd>
                </div>
                <div>
                  <dt>Turns</dt>
                  <dd>{totalTurns}</dd>
                </div>
                <div>
                  <dt>Codex</dt>
                  <dd>
                    <ModelRoute role="codex" model={codexModel} effort={codexEffort} />
                  </dd>
                </div>
                <div>
                  <dt>Claude</dt>
                  <dd>
                    <ModelRoute role="claude" model={claudeModel} effort={claudeEffort} />
                  </dd>
                </div>
                <div>
                  <dt>Antigravity</dt>
                  <dd>
                    <ModelRoute
                      role="antigravity"
                      model={antigravityModel}
                      effort={antigravityEffort}
                    />
                  </dd>
                </div>
              </dl>
              {roomMode === "session" &&
                (status === "preparing" || status === "running") && (
                <form className="add-rounds-control" onSubmit={addDiscussionRounds}>
                  <label htmlFor="rounds-to-add">Add rounds</label>
                  <div>
                    <select
                      id="rounds-to-add"
                      value={roundsToAdd}
                      onChange={(event) => setRoundsToAdd(event.target.value)}
                      disabled={addingRounds}
                      aria-label="Rounds to add"
                    >
                      {[1, 2, 3, 4, 5].map((value) => (
                        <option value={value} key={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                    <button type="submit" disabled={addingRounds}>
                      <Plus size={14} />
                      {addingRounds ? "Adding…" : "Add"}
                    </button>
                  </div>
                  <small>Extends this room without losing its transcript.</small>
                </form>
              )}
              {!busy && (
                <button className="new-discussion-button" type="button" onClick={resetToSetup}>
                  <Sparkles size={15} />
                  New discussion
                </button>
              )}
              <p className="session-summary-note">
                {roomMode === "archive"
                  ? "Archived rooms cannot steer, retry, or stop agent work."
                  : "Models and project stay locked. You can add rounds while the room is live."}
              </p>
            </div>
          )}
        </aside>

        <section className="conversation-panel">
          <div className="conversation-header">
            <div>
              <p className="eyebrow">
                {roomMode === "setup"
                  ? "CONVERSATION PREVIEW"
                  : roomMode === "archive"
                    ? "ARCHIVED DISCUSSION"
                    : "PROJECT ROOM"}
              </p>
              <h1>Three agents. One project.<br />You set the direction.</h1>
            </div>
            <div className="conversation-actions">
              {roomMode !== "setup" && !busy && (
                <button className="utility-button" type="button" onClick={resetToSetup}>
                  <Sparkles size={15} />
                  New
                </button>
              )}
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
                  {status === "synthesizing"
                    ? "Skip brief"
                    : status === "failed"
                      ? "End discussion"
                      : "Stop"}
                </button>
              )}
            </div>
          </div>

          <div
            className="progress-rail"
            role="progressbar"
            aria-label="Discussion progress"
            aria-valuemin={0}
            aria-valuemax={totalTurns}
            aria-valuenow={completedTurnCount}
            aria-valuetext={`${completedTurnCount} of ${totalTurns} turns complete`}
          >
            <span style={{ width: `${progress}%` }} />
          </div>

          <div
            className="message-feed"
            ref={feedRef}
            role="log"
            aria-label="Discussion transcript"
            aria-live="off"
            tabIndex={0}
            onScroll={(event) => {
              const feed = event.currentTarget;
              shouldAutoScrollRef.current =
                feed.scrollHeight - feed.scrollTop - feed.clientHeight <= 72;
            }}
          >
            {messages.length === 0 && !speaker && (
              <div className="empty-state">
                <Terminal size={25} />
                <h2>The room is ready.</h2>
                <p>Your first agent turn will appear here.</p>
              </div>
            )}
            {messages.map((message, index) => (
              <article className={`message ${message.role}`} key={message.id}>
                <div className="message-meta">
                  <span className={`agent-glyph ${message.role}-glyph`}>
                    {message.role === "human" ? "Y" : AGENT_GLYPHS[message.role]}
                  </span>
                  <div>
                    <strong>[M{index + 1}] {message.author}</strong>
                    <small>
                      {message.round ? `ROUND ${message.round} · ` : ""}
                      {message.stage === "sealed"
                        ? "SEALED OPENING · "
                        : message.stage === "cross-examination"
                          ? "CROSS-EXAMINATION · "
                          : ""}
                      {displayTime(message.at)}
                      {message.model
                        ? ` · ${friendlyModelName(message.role === "human" ? "codex" : message.role, message.model)}`
                        : ""}
                      {message.effort ? ` · ${friendlyEffort(message.effort)}` : ""}
                    </small>
                  </div>
                </div>
                <div className="message-content">
                  <p>{message.body}</p>
                  {message.context?.coverage.truncated && (
                    <p className="message-context-warning">
                      Partial input · omitted{" "}
                      {message.context.coverage.omittedLabels?.join(", ") || "earlier context"}
                    </p>
                  )}
                  <ReportedChecks message={message} />
                </div>
              </article>
            ))}
            {pendingSteering.length > 0 && (
              <section className="undelivered-steering" aria-labelledby="pending-steering-title">
                <span className="human-pulse" />
                <div>
                  <h2 id="pending-steering-title">{pendingSteeringCopy.title}</h2>
                  <p>{pendingSteeringCopy.description}</p>
                  <ul>
                    {pendingSteering.map((message) => (
                      <li key={message.id}>{message.body}</li>
                    ))}
                  </ul>
                </div>
              </section>
            )}
            {failedTurn && (status === "failed" || status === "retrying") && (
              <section className="failed-turn-card" role="alert" aria-labelledby="failed-turn-title">
                <div className="failed-turn-icon">
                  {AGENT_GLYPHS[failedTurn.role]}
                </div>
                <div>
                  <span className="context-label">
                    {roomMode === "archive"
                      ? `ARCHIVED AT TURN ${failedTurn.turn + 1}`
                      : `TURN ${failedTurn.turn + 1} PAUSED`}
                  </span>
                  <h2 id="failed-turn-title">
                    {roomMode === "archive"
                      ? `${AGENT_LABELS[failedTurn.role]} did not complete this archived turn`
                      : `${AGENT_LABELS[failedTurn.role]} failed before replying`}
                  </h2>
                  <p>{failedTurn.safeError}</p>
                  {roomMode !== "archive" && (
                    <small>
                      {failedTurn.attempts === 1
                        ? "First attempt failed"
                        : `${failedTurn.attempts} attempts failed`}
                      {" · "}Retry available until {displayTime(failedTurn.expiresAt)}
                    </small>
                  )}
                  {viewingHistory ? (
                    <p className="failed-turn-readonly">
                      This archived recovery state is read-only.
                    </p>
                  ) : (
                    <div className="failed-turn-actions">
                      <button
                        type="button"
                        onClick={() => void retryFailedTurn()}
                        disabled={status === "retrying"}
                      >
                        <RefreshCw size={14} />
                        {status === "retrying"
                          ? "Retrying…"
                          : `Retry ${AGENT_LABELS[failedTurn.role]} turn`}
                      </button>
                      <button
                        type="button"
                        onClick={() => void skipFailedTurn()}
                        disabled={status === "retrying"}
                      >
                        Continue without {AGENT_LABELS[failedTurn.role]}
                      </button>
                      <button type="button" onClick={() => void stopDiscussion()}>
                        <CircleStop size={14} />
                        End discussion
                      </button>
                    </div>
                  )}
                </div>
              </section>
            )}
            {status === "preparing" && (
              <article className="message thinking preparation">
                <div className="message-meta">
                  <span className="agent-glyph preparation-glyph">P</span>
                  <div>
                    <strong>Preparing isolated workspaces</strong>
                    <small>{statusStage ? statusStage.replaceAll("-", " ").toUpperCase() : "STARTING"}</small>
                  </div>
                </div>
                <div className="thinking-state">
                  <div className="thinking-line" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <p className="process-liveness is-active">
                    {statusNote || "Preparing one validated source for the role workspaces."}
                  </p>
                </div>
              </article>
            )}
            {speaker && (
              <article className={`message thinking ${speaker}`}>
                <div className="message-meta">
                  <span className={`agent-glyph ${speaker}-glyph`}>
                    {AGENT_GLYPHS[speaker]}
                  </span>
                  <div>
                    <strong>{AGENT_LABELS[speaker]}</strong>
                    <small>
                      {status === "synthesizing"
                        ? "PREPARING THE BRIEF"
                        : status === "reviewing"
                          ? "AUDITING THE BRIEF"
                          : turn < 3
                            ? "SEALED INDEPENDENT OPENING"
                            : "CROSS-EXAMINING THE ROOM"}
                    </small>
                  </div>
                </div>
                <div className="thinking-state">
                  <div className="thinking-line" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <p
                    className={`process-liveness ${liveness?.state === "process-active" ? "is-active" : ""}`}
                    data-testid="process-liveness"
                  >
                    {livenessDetail || "Starting the agent request…"}
                  </p>
                </div>
              </article>
            )}
            {showCompletionBrief && (
              <div className="feed-outcome">
                <OutcomeCard
                  outcome={outcome}
                  status={status}
                  dissent={dissent}
                  dissentReviews={dissentReviews}
                  dissentJudgments={dissentJudgments}
                  onJudge={sessionId && outcome && !historyWarning ? judgeDissent : undefined}
                />
              </div>
            )}
          </div>

          {roomMode !== "archive" && !showCompletionBrief && (
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
                      : status === "failed" || status === "retrying"
                        ? "Retry, skip, or end this turn before adding another note…"
                        : status === "preparing"
                          ? "Preparing isolated workspaces before the first turn…"
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
          )}
        </section>

        <aside className="context-panel">
          <div className="panel-heading">
            <p className="eyebrow">ROOM CONTEXT</p>
            <span className="step-count">02</span>
          </div>

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
            <span className="context-label">DELIBERATION ROUTE</span>
            <ol className="turn-order">
              <li className={speaker === "codex" ? "current" : ""}>
                <span className="codex-number">01</span>
                Codex
              </li>
              <li className={speaker === "claude" ? "current" : ""}>
                <span className="claude-number">02</span>
                Claude
              </li>
              <li className={speaker === "antigravity" ? "current" : ""}>
                <span className="antigravity-number">03</span>
                Antigravity
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
                  <ModelRoute role="codex" model={codexModel} effort={codexEffort} />
                </dd>
              </div>
              <div>
                <dt>Claude</dt>
                <dd>
                  <ModelRoute role="claude" model={claudeModel} effort={claudeEffort} />
                </dd>
              </div>
              <div>
                <dt>Antigravity</dt>
                <dd>
                  <ModelRoute
                    role="antigravity"
                    model={antigravityModel}
                    effort={antigravityEffort}
                  />
                </dd>
              </div>
            </dl>
          </section>

          <section className="context-block">
            <span className="context-label">SAFETY BOUNDARY</span>
            <div className="safety-note">
              <span className="safe-dot" />
              <p>
                Agents work from separate disposable copies, never the selected project. Codex can
                write generated artifacts only inside its native sandbox; Antigravity&apos;s model
                process stays behind its native and outer guards.
                {health?.projectWriteGuard
                  ? " Native permissions plus outer macOS guards read-deny common host credential paths and isolate every workspace. Claude has no shell access; it remains on Read, Glob, and Grep while optional checks run beyond the model-client boundary through Roundtable."
                  : " Without a supported OS guard, Claude stays read-only."}
                {" "}Bridge and ambient API credentials are never passed to agent processes;
                each CLI uses its own persisted sign-in.
              </p>
            </div>
          </section>

          <section className="context-block">
            <span className="context-label">TEST CAPABILITY</span>
            <div className="safety-note">
              <span className="safe-dot" />
              <p>
                Focused checks in separate disposable project copies are optional. Codex can run
                them natively. Claude and Antigravity can each request one approved argv command; Roundtable runs
                it without a shell in a fresh broker-only project copy with loopback-only network
                access and returns the result. External and private-network destinations stay
                blocked, and test mutations are discarded before the participant&apos;s follow-up.
                Claude&apos;s model process remains read-only.{" "}
                {health?.testSandbox?.claudeReason}
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
