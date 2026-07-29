# Changelog

Every Roundtable release represents one complete iteration: a visible Codex–Claude
discussion, the implementation selected from that discussion, and verification of
the resulting app. Versions advance in `v0.0.0.1` increments.

## [v0.0.0.4] — 2026-07-29

### Conversation

Prompt: with secure CLI orchestration, visible model and reasoning controls,
completion briefs, and restart-safe local history already present, compare
transcript navigation, agent-position comparison, action follow-through, prompt
reuse, Outcome repair, and runtime resilience; then choose one bounded feature.

Across two rounds, Codex and Claude selected explicit **Retry failed turn**
recovery. The prior release’s live `529 Overloaded` smoke test supplied the
evidence: a temporary provider failure should not terminate and archive an
otherwise useful discussion. They converged on suspending the exact turn behind
a retry, stop, or expiry gate; preserving the completed transcript; rebuilding
the prompt from frozen state; disabling steering during the pause; keeping SSE
and refresh recovery live; and making restart-recovered sessions read-only.

### Added

- A nonterminal `failed` phase carrying the failed agent, zero-based turn, safe
  error, attempt count, failure time, and retry deadline.
- A visible failed-turn card with **Retry Codex/Claude turn** and **End
  discussion** controls, plus accurate retry progress and pause copy.
- An authenticated `POST /sessions/:id/retry` action that atomically claims the
  suspended turn and rejects stale or competing requests with `409`.
- An inner agent-attempt loop that remains inside the same live session, agent,
  and turn until retry succeeds, the user ends the discussion, or the pause
  expires.
- Snapshot and SSE recovery of failed and retrying phases so a same-tab refresh
  restores the retry affordance while the original bridge remains alive.
- A dedicated 15-minute failed-turn deadline that converts abandoned pauses to a
  terminal error and releases retained session capacity.

### Safety and reliability

- Rebuilds retry prompts deterministically from the unchanged transcript instead
  of caching a second source of truth.
- Disables steering during failure and retry so the retried input cannot silently
  change; notes already targeted to later turns remain untouched.
- Emits a transcript message only after a usable agent response, preventing
  duplicates and synthetic failure messages.
- Resolves Stop through the suspended-turn gate even when no CLI child process is
  active.
- Sanitizes bearer credentials, tokens, tickets, API keys, and credential fields
  before errors reach UI, SSE, snapshots, or opted-in history.
- Persists failure status only for opted-in history. After bridge restart, the
  existing archive recovery converts the unfinished session to read-only
  `interrupted` rather than retrying it automatically.

### Verification

- Seventeen bridge and archive tests, including exact-prompt equality,
  same-role/same-turn recovery, duplicate retry rejection, clean stop from
  failure, pause expiry and capacity release, credential redaction, and failed
  archive interruption on restart.
- Production build, lint, rendered HTML checks, and diff validation.
- A live two-round Codex–Claude design review with a structured consensus brief.
- A controlled real-CLI smoke test using an intentionally invalid Claude model:
  Codex’s completed reply remained intact, Claude paused with a sanitized error,
  retry advanced the attempt count without duplicating the transcript, steering
  stayed disabled, and End discussion produced a clean Stopped outcome.

## [v0.0.0.3] — 2026-07-29

### Conversation

Prompt: audit the current product and codebase, compare durable or local history,
transcript navigation and search, agent-position comparison, action-item workflow,
synthesis repair, and accessibility, then converge on the highest-leverage bounded
feature for repeated real-world use.

Across two rounds, Codex and Claude selected an opt-in local discussion archive.
They agreed that repeated use first needs trustworthy continuity: a small
metadata-only Recent Discussions drawer, faithful read-only transcript recovery,
an append-only event log, owner-only storage outside the project, explicit
retention and deletion, and honest recovery states for interrupted work and
undelivered steering.

### Added

- A first-run choice to archive new discussions locally, remembered in the
  browser and independently changeable from the History drawer.
- A metadata-only Recent Discussions list showing topic, project name, date,
  terminal state, and message count without loading transcript bodies.
- Read-only archived discussion views that restore the transcript, participant
  models and reasoning levels, Outcome, status, warnings, and pending steering.
- Per-record deletion, clear-all confirmation, opt-out controls, and a bridge-wide
  `ROUNDTABLE_HISTORY=off` kill switch.
- Append-only NDJSON session event logs and an atomically replaced metadata index
  in the operating system user-data directory.
- A separate authorized `/history` API namespace that does not occupy live session
  capacity or repopulate the in-memory live session map.
- Archived Markdown export of queued-but-never-delivered steering in a separate,
  explicit section.

### Privacy and reliability

- Enforced owner-only `0700` directory and `0600` file modes and kept archive
  files outside the discussed project by default.
- Sanitized credential-bearing structural fields recursively at the persistence
  boundary, including bridge tokens, bearer authorization, SSE tickets, and
  credential fields.
- Limited the archive to 50 records and 30 days, pruning both metadata and event
  logs.
- Marked unfinished discussions `interrupted` during bridge initialization and
  preserved undelivered steering outside the transcript.
- Recovered all valid events before a damaged final NDJSON line and surfaced a
  visible “History incomplete” warning instead of losing the record.
- Kept live discussions running when history writes fail, while surfacing an
  archive warning over SSE.
- Replaced the misleading completion-brief placeholder with a terminal explanation
  when an error, stop, or interruption ends a discussion before synthesis.

### Verification

- Thirteen bridge and archive tests covering metadata isolation, exact archive
  retrieval, retention, deletion, clearing, owner-only permissions, credential
  sanitization, torn-write recovery, restart interruption, pending steering, and
  nonfatal history failures.
- Production build, lint, diff checks, and two rendered-HTML tests.
- Live opt-in smoke test confirming the History count, archived Error record, and
  metadata drawer after Claude returned a temporary `529 Overloaded` response.
- Real bridge restart with a new bearer key confirming the old in-memory session
  was recovered from the local archive as a read-only Error transcript with its
  model and reasoning metadata intact.

## [v0.0.0.2] — 2026-07-29

### Conversation

Prompt: audit Roundtable as a product and codebase, compare navigation, summaries,
decisions and action items, search, history, and accessibility, then converge on
the single highest-leverage bounded improvement for understanding long
discussions and turning them into action.

Across two rounds, Codex and Claude agreed that the transcript already makes the
discussion visible but does not answer “What did we decide, and what happens
next?” They selected a structured completion brief over search or session
history. Their implementation constraints were adopted: Codex synthesizes rather
than the final speaker, synthesis has an explicit phase, every turn remains
represented when input must be shortened, refresh replay restores the same brief,
and synthesis failure or skipping never discards the transcript.

### Added

- A pinned, accessible Outcome region with:
  - the decision or explicit no-consensus result;
  - rationale;
  - ordered next actions owned by You, Codex, Claude, or Unassigned;
  - open questions and disagreements;
  - a visible disclosure when long messages were shortened for synthesis.
- A dedicated post-discussion Codex synthesis pass with validated structured JSON.
- An explicit `synthesizing` lifecycle phase, live status, locked settings, and a
  “Skip brief” action that preserves the completed discussion.
- Outcome persistence in session snapshots and deterministic SSE replay before the
  terminal status event.
- Outcome content at the beginning of copied and exported Markdown transcripts.
- Responsive Outcome rendering in the main conversation column when the desktop
  context rail is hidden.
- Explicit unavailable states for synthesis failure, skipped synthesis, and a
  discussion stopped before synthesis.

### Reliability

- Added a coverage-aware synthesis input builder that preserves the goal and every
  message index, author, and round. It shortens individual long bodies instead of
  silently dropping early turns.
- Fixed the client stream lifecycle to close only on terminal states and to
  reconnect during synthesis.
- Split `busy` from `canSteer` so configuration remains locked through synthesis
  while steering correctly ends with the final discussion turn.
- Kept outcome validation strict and surfaced honest failure instead of silently
  coercing malformed model output.

### Verification

- Six bridge tests covering chronology, recovery, replay ordering, partial
  coverage, fenced JSON, malformed/failing synthesis, skip behavior, and early
  stop.
- Production build and two rendered-HTML tests, including the accessible Outcome
  region.
- Live one-round CLI smoke test confirming the synthesizing state, structured
  no-consensus brief, participant-owned action, and same-tab refresh recovery
  without another synthesis call.

## [v0.0.0.1] — 2026-07-29

### Conversation outcome

The first three Roundtable reviews established the product and then concentrated
on the controls and lifecycle guarantees needed for a trustworthy local
collaboration room. The agents recommended making execution settings visible,
preserving steering chronology, securing the local bridge, and keeping sessions
recoverable without hiding process failures.

### Added

- A visible, steerable discussion room where Codex CLI and Claude CLI alternate
  over a shared project and transcript.
- Per-agent model selectors with friendly names alongside exact CLI model IDs.
- Per-agent reasoning-effort sliders, including high, extra high, max, and the
  effort levels each installed CLI supports.
- Live turn phases, queued steering notes, stop controls, round selection, and
  participant metadata on every message.
- Same-tab session recovery while the local bridge remains alive.
- Copy and Markdown export actions for completed transcripts.
- A local launcher that starts the browser app and bridge together.
- Bridge-core and rendered-HTML regression tests.

### Security and reliability

- Bound the bridge to `127.0.0.1` and protected it with a fresh random bearer
  credential on every launch.
- Replaced long-lived event-stream credentials with short-lived, single-use SSE
  tickets.
- Kept Codex in a read-only sandbox and constrained Claude to safe read tools,
  with an additional macOS write guard for the selected project.
- Preserved chronological steering by applying queued notes only at turn
  boundaries.
- Added explicit terminal states and status codes, inactivity cleanup, session
  limits, and full process-group termination with escalation.
- Fixed stopping immediately before a CLI process spawns and stale reconnect
  messaging after a terminal session.

### Verification

- `npm run test:bridge`
- `npm test`
- Live browser smoke tests covering start, reconnect, steer, stop, and completed
  transcript export.
