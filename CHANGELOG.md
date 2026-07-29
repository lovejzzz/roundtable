# Changelog

Every Roundtable release represents one complete iteration: a visible Codex–Claude
discussion, the implementation selected from that discussion, and verification of
the resulting app. Versions advance in `v0.0.0.1` increments.

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
