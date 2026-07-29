# Changelog

Every Roundtable release represents one complete iteration: a visible Codex–Claude
discussion, the implementation selected from that discussion, and verification of
the resulting app. Versions advance in `v0.0.0.1` increments.

## [v0.0.0.6] — 2026-07-29

### Conversation

Prompt: audit v0.0.0.5's new disposable test capability with focused checks when
useful, compare test-evidence presentation, transcript navigation, prompt reuse,
action follow-through, retry configuration, and runtime observability, then
choose one bounded improvement with concrete UX, data, failure, privacy, and
acceptance criteria.

Across two rounds, Codex and Claude selected **first-class agent-reported check
evidence**. Codex ran the isolated sandbox test successfully and found its
loopback-dependent bridge tests environment-blocked. Claude's first Bash attempt
exposed an overly broad home-folder write denial. Both agreed that passed,
failed, and blocked must remain distinct; that the UI must say “Reported by
Codex/Claude” rather than imply bridge verification; and that evidence must
survive the entire transcript and archive pipeline. They also classified the
copy cancellation, sibling isolation, stale cleanup, and Claude runtime issues as
release-blocking corrections to v0.0.0.5 rather than competing features.

### Added

- A trailing, versioned `roundtable-checks` JSON transport for optional check
  reports with command, closed passed/failed/blocked status, optional exit code,
  concise summary, and server-assigned producing round.
- All-or-nothing parsing after a successful agent attempt. A fully valid final
  block becomes structured evidence and is removed from prose; an absent or
  malformed block leaves the complete reply untouched.
- Accessible native disclosure controls labeled **Reported by <agent>**, with
  mixed-status counts and expanded status, round, exit code, command, and
  summary rows.
- An explicit notice that evidence is agent-reported rather than independently
  verified and that each agent's disposable workspace is cumulative across its
  turns.
- Evidence propagation through subsequent-agent transcripts, Outcome synthesis,
  SSE replay and snapshots, opted-in history reconstruction, same-tab reconnect,
  copy, and Markdown export.

### Privacy, provenance, and resilience

- Caps reports at six checks and bounds command and summary lengths; accepts only
  the closed status vocabulary and integer exit codes from 0 through 255.
- Redacts credential-shaped strings before SSE or persistence, replaces known
  disposable roots with `$SANDBOX`, and never captures raw stdout automatically.
- Applies the same string redactor throughout local history in addition to
  removing credential-shaped structural fields.
- Preserves prose/evidence disagreement without silently reconciling it and
  avoids any badge when no valid evidence was reported.
- Keeps synthesis in a read-only Codex sandbox even though discussion turns may
  run optional checks.

### Sandbox corrections

- Replaced the overlapping temporary prefix with
  `roundtable-agent-sandbox-*`; reply-output directories now use a distinct
  prefix.
- Added 24-hour stale-root cleanup scoped to the dedicated sandbox prefix, so a
  bridge restart cannot delete a concurrent room or pending reply.
- Made project copying observe Stop and a two-minute preparation deadline, with
  incomplete roots removed before agent startup.
- Canonicalized temporary roots before generating OS profiles.
- Allowed Claude's required `.claude` runtime state while denying writes to the
  selected project and existing home entries, and denying both reads and writes
  to Codex's sibling workspace.
- Added an outer sibling-deny profile to later Codex turns and synthesis when
  Claude's copy exists.
- Replaced `sandbox-exec` presence detection with a real trivial-profile startup
  probe; failed probes now keep Claude on the existing read-only path and surface
  the reason in room context.

### Verification

- Twenty-two bridge, archive, parser, redaction, copy, stale-cleanup, and sandbox
  tests, including a real macOS profile that permits Claude runtime state while
  blocking the project and sibling copy. Nested managed environments skip only
  that process-level assertion when the kernel refuses nested profiles.
- Production build, lint, two rendered-page contract checks, and diff
  validation.
- The two-round Codex–Claude design review completed with a structured consensus
  brief.
- A separate one-round real-CLI smoke run had both agents invoke the focused
  sandbox suite. Codex's evidence rendered as an expandable blocked report,
  reached Claude's next-turn transcript with provenance intact, and was included
  in the completion brief. Claude also emitted two structured results, proving
  Bash startup and the end-to-end evidence transport; its nested-profile finding
  led directly to the startup probe and nested-aware test behavior above.

## [v0.0.0.5] — 2026-07-29

### Direction

This user-directed capability release gives both participants an optional way to
validate repository claims before presenting them. The boundary is intentionally
evidence-oriented rather than autonomous implementation: agents can run existing
checks, but their source project and one another's working state remain
protected.

### Added

- Lazy, per-agent disposable project copies created under the operating system's
  temporary directory and deleted when the discussion reaches a terminal state.
- Workspace-write execution for Codex inside its own CLI sandbox, enabling
  focused tests, lint, type checks, and builds without touching the selected
  project.
- Optional Bash access for Claude on macOS when `sandbox-exec` is available,
  while retaining the prior read-only tool set on systems without an OS write
  guard.
- A visible **Test capability** status in the room explaining whether both
  agents or only Codex can run checks.
- Discussion instructions that make validation optional, prohibit intentional
  source edits and destructive commands, and require accurate command/result
  reporting when an agent chooses to test.

### Safety and reliability

- Creates distinct Codex and Claude copies so generated artifacts and accidental
  edits cannot leak between participants or into the selected project.
- Excludes `.git`, `.next`, `.wrangler`, and `dist` from copies while retaining
  installed dependencies for practical offline checks.
- Keeps Codex under its native `workspace-write` sandbox and, on macOS, protects
  both the selected project and the user's home folder from Claude writes.
- Cleans both temporary roots from the bridge's terminal-session lifecycle,
  including completion, stop, expiry, and unrecovered error paths.
- Preserves failed-turn retry semantics by reusing the same agent copy throughout
  a live room and deleting it only after that room ends.

### Verification

- Eighteen bridge and archive tests, including copy isolation, cache reuse,
  generated-directory exclusion, dependency availability, original-project
  immutability, cross-agent isolation, and terminal cleanup.
- Rendered-HTML assertions for the visible optional test capability.
- Production build, lint, and diff validation.

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
