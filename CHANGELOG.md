# Changelog

Every Roundtable release represents one complete iteration: a visible Codex–Claude
discussion, the implementation selected from that discussion, and verification of
the resulting app. Versions advance in `v0.0.0.1` increments.

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
