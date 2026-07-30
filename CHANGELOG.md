# Changelog

Every Roundtable release represents one complete iteration: a visible agent
discussion, the implementation selected from that discussion, and verification
of the resulting app. Versions advance in `v0.0.0.1` increments.

## [v0.0.0.10] — 2026-07-29

### Conversation

Prompt: add the locally installed Antigravity CLI as a first-class Roundtable
participant, then validate the three-agent room against the real repository and
production sandbox path.

The installed `agy` 1.1.8 CLI exposed a usable non-interactive contract with
model selection, low/medium/high effort, plan mode, native terminal sandboxing,
and eleven discoverable models. The first live integration gate correctly
paused Antigravity's turn when the CLI exited 0 without a reply. Exact stderr
reproduction showed that headless Antigravity auto-denied its own `read_file`
tool unless permissions were pre-approved.

After containing headless tool approval inside the existing disposable copy,
plan mode, native terminal sandbox, and outer macOS guard, Antigravity produced
a repository-grounded review. It found two integration defects: sibling
sandboxes were created lazily, so early agents could not deny roots that did not
yet exist; and Antigravity's value-taking `--print` flag put the growing
transcript in `argv`, risking `E2BIG` in long rooms. Both findings were accepted
and repaired before release.

### Third participant

- The bridge now detects `agy`, its version, required flags, configured model,
  effort levels, and live `agy models` output. A room requires Codex, Claude,
  and Antigravity to be available.
- Every round now runs Codex, Claude, then Antigravity. Steering boundaries,
  progress, failure/retry, completion coverage, stable message labels, and
  optional dissent review all operate on three agent turns.
- Antigravity messages, model, effort, reported checks, failures, dissent,
  outcomes, local history, recovery snapshots, and Markdown exports use the
  same first-class contracts as the existing participants. Antigravity is also
  a valid completion-action owner.

### Model and reasoning controls

- The participant panel shows Antigravity CLI 1.1.8, a model field backed by
  every model reported by the installed CLI, and a low/medium/high reasoning
  slider.
- Gemini identifiers receive readable labels while the exact CLI value remains
  editable. Session settings lock at start, appear on each message and in the
  context rail, and survive refresh, archive reconstruction, copy, and export.
- The room headline, metadata, preview transcript, turn order, model routing,
  presence state, active speaker, and failure cards now visibly represent three
  agents.

### Antigravity execution boundary

- Antigravity runs with `--mode plan`, native `--sandbox`, and headless tool
  approval inside its own disposable project copy. The outer macOS profile
  denies the original project, both sibling sandbox roots, common host
  credential paths, and the other CLIs' auth/config state. The final live gate
  found and closed a missing Claude-to-Antigravity edge: Claude now explicitly
  read-denies both `.antigravity` and `.gemini`.
- All three disposable copies are created before the first turn. This makes
  every sibling root concrete before any process profile is built and removes
  the lazy-isolation gap found by Antigravity.
- The full Antigravity control prompt is written to a random, owner-only,
  one-use instruction file inside its disposable workspace. `agy --print`
  receives only a short reference, avoiding transcript-sized process arguments;
  the file is removed after the call and the workspace is deleted at session
  completion.

### Verification

- Added Antigravity invocation, prompt-capability, three-turn routing,
  three-review dissent, model/effort persistence, UI rendering, and sandbox
  policy regressions.
- Ran 36 bridge, archive, environment, invocation, prompt-file lifecycle, copy,
  sandbox, and redaction tests, lint, and a production build successfully.
- Ran the actual three-agent bridge against this repository. The first gate
  reproduced and explained the headless permission failure; a contained exact
  prompt run then returned a 2,721-character repository review and drove eager
  sandbox creation plus file-based prompt delivery. The final gate produced a
  substantive Antigravity turn with exact repository citations, caught the
  missing Claude credential denials, and drove the executable guard regression
  before release.

## [v0.0.0.9] — 2026-07-29

### Conversation

Prompt: review what the agents want for Roundtable, then implement the smallest
honest experiment for learning whether completion briefs lose important
dissent.

Across three rounds, Codex and Claude rejected a premature full decision ledger.
They selected a five-discussion experiment instead: stable message labels, one
optional dissent-only pass from each agent, agent-stated dissent beside the
normal brief, and durable owner judgments marking each item represented or
missed. History is mandatory for experiment sessions so those judgments remain
meaningful after completion.

The first six-turn live implementation gate found that the draft contaminated
its own measurement by feeding dissent back into synthesis and called
model-written summaries “verbatim.” It also exposed asynchronous history races,
silent empty or failed reviews, whole-message omissions in long review inputs,
and live/archive redaction differences. That gate completed with 12 dissent
items and a real judgment that survived archive reload.

A corrected one-round gate then verified transcript-only synthesis, frozen
briefs, both isolated review passes, labeled coverage-preserving input, and the
represented/missed controls. Its final narrow blocker was unsupported reader
copy (“faithful” and “no concerns”); the release uses “agent-stated summaries”
and “no concerns reported,” with contract tests for both.

### Dissent coverage experiment

- Every transcript message now has a deterministic session-order label such as
  `[M1]` in agent prompts, the room, and Markdown export.
- A new opt-in **Dissent check** runs only when local history is enabled. Codex
  first produces the ordinary completion brief from the transcript alone; that
  brief is frozen before one dissent-only pass runs for Codex and one for Claude.
- Each reviewer receives an excerpt from every labeled message, plus explicit
  truncation coverage. Review output is bounded, secret-redacted before live
  display, attributed, and described as an agent-stated summary rather than a
  quote or verified fact.
- Each pass persists a separate `completed` or `unavailable` record with input
  coverage, so “no concerns reported” is distinguishable from a failed review.
  One malformed or failed review cannot discard the brief or block the other
  agent.
- Dissent appears beside the unchanged brief with bridge-minted `D#` IDs,
  source-message labels, position, summary, and reason.

### Durable owner judgments

- Represented/missed judgments use an authenticated post-completion history
  endpoint and append `dissent.judged` events with last-write-wins restoration.
- The endpoint waits for pending dissent writes, fails closed when history is
  incomplete, awaits the judgment append before success, and broadcasts changes
  to other connected tabs.
- History reads now execute inside the store's serialization queue. Rebuilds
  deduplicate dissent IDs, preserve per-agent review status, and retain a
  latched history warning after storage recovers.
- The room disables judgment controls when durability is uncertain. Copy and
  export include review status, input coverage, every dissent item, and the
  current owner judgment.

### Verification

- Added dissent schema, stable-label, prompt-coverage, transcript-only synthesis,
  redaction, failure-isolation, durable judgment, review reconstruction, and
  reader-copy regressions.
- Ran 30 bridge, archive, environment, invocation, copy, sandbox, and redaction
  tests, lint, a production build, and two rendered-page checks successfully.
- Ran two real Codex–Claude gates. The corrected gate rendered seven dissent
  items in the browser; a “Missed” judgment remained selected after reload.

## [v0.0.0.8] — 2026-07-29

### Conversation

Prompt: design the smallest safe architecture that preserves useful project
checks while removing Claude Bash from the model-client privilege boundary;
compare a named-check broker, MCP transports, restricted helpers, hooks,
proxies, containers, and disclosure against an explicit adversarial threat
model.

Across two rounds, Codex and Claude reached consensus that v0.0.0.8 must remove
Claude Bash unconditionally and defer brokered Claude checks. They verified that
the outer macOS profile must retain Claude's model transport and some runtime
access, cannot apply a nested Seatbelt profile, and therefore cannot safely
contain shell code. Claude also found that the permitted runtime paths could
allow injected shell activity to persist beyond a disposable copy.

The review rejected a restricted Bash helper, hooks, permission interception,
and a proxy as policy layers rather than execution boundaries. It also rejected
shipping an incomplete broker: the current bridge tracks one agent process,
lacks independent check cancellation and provenance, and has not proven a safe
MCP capability transport.

### Security repair

- Claude now always runs in plan mode with only Read, Glob, and Grep. Bash is
  absent from both its tool list and allowed-tool policy on every platform.
- The bridge health contract and room context fail closed and explicitly say
  that Claude checks are unavailable until execution has a separate brokered
  runner. Claude's prompt cannot claim test access or emit check evidence.
- Codex retains its native sandboxed, optional focused-check capability.
- Claude continues to receive safe mode, strict empty MCP configuration,
  disabled session persistence, the outer host/project guard where supported,
  and a bridge-token-scrubbed environment.

### Copy-boundary correction

Claude's final turn reproduced a separate bug in Node's default recursive copy:
an internal relative symlink was rewritten as an absolute link into the original
project. Roundtable now copies with verbatim symlink semantics, preserves links
that remain relative and resolve inside both the selected project and the copied
workspace, and rejects absolute, dangling, external, or relocation-unsafe links.
A post-copy walk independently verifies every surviving link before agent
startup and removes the partial root on failure. Codex's native permission
profile now also denies the original project path as defense in depth, and
Claude's outer profile denies both reads and writes to that path. Links into
intentionally omitted generated trees fail closed rather than silently changing
meaning in the copy. This correction is a prerequisite for any future broker
runner and makes the existing disposable-copy claim accurate.

### Verification

- Added a direct Claude invocation contract test proving plan mode,
  `Read,Glob,Grep`, safe mode, strict MCP isolation, no session persistence, and
  the complete absence of Bash and `allowedTools`.
- Added executable symlink regressions: a safe internal relative link must
  resolve inside the disposable workspace; absolute-internal, external, and
  outward-and-back links must fail before copy; and a simulated post-copy escape
  must be caught with no partial sandbox root left behind.
- Ran 27 bridge, archive, environment, invocation, copy, sandbox, and redaction
  tests plus lint before the live gate.
- The release design room completed four real CLI turns and a structured
  consensus brief. The first live implementation gate blocked release on the
  absolute-internal and relocation-unsafe symlink cases, which drove the
  post-copy verification and Codex original-path deny above. A fresh gate then
  rechecked the remediated boundary before release.

## [v0.0.0.7] — 2026-07-29

### Conversation

Prompt: audit the tools Codex and Claude actually have in v0.0.0.6, run focused
checks where useful, classify possible additions by necessity and risk, and
converge on the smallest justified capability change.

Across two rounds, both agents concluded that no new raw tool is justified:
existing read/search plus sandboxed Bash already cover installed tests, builds,
lint, type checks, coverage, artifacts, and local logs. Codex initially proposed
precomputed Git status and diff context, but Claude demonstrated that automatic
patch sharing exceeds the current redactor's privacy guarantees. Git content,
network installs, browser automation, MCP/connectors, source editing, subagents,
and dedicated test tools were therefore deferred.

The live audit instead found two existing exposures. Claude's guarded Bash could
read common host credential paths, and both CLI children inherited the same
`ROUNDTABLE_BRIDGE_TOKEN` used to authenticate the local control plane. Claude
also verified that simply adding `(deny network*)` would block its own model API
transport because the macOS profile wraps the entire CLI.

### Security hardening

- Agent child environments now remove `ROUNDTABLE_BRIDGE_TOKEN` after all
  inherited and per-call environment values are merged, while preserving the
  variables required by each signed-in CLI.
- Codex's native permission profiles and Claude's outer macOS profile now block
  reads from common SSH, cloud, GitHub, Kubernetes, Docker, npm, netrc, Git
  credential, and Python package credential locations while continuing to allow
  the `.codex` and `.claude` runtime access required by their owning CLI. Each
  agent content-denies the other CLI's auth/config directory, and Codex also
  denies Claude's sibling `.claude.json` state file.
- Claude home entries are refreshed before each spawn, and `.claude` writes are
  narrowed to known runtime entries; existing settings and other non-runtime
  state are write-denied.
- The room now discloses that bridge credentials are not passed to agents and
  that Claude's guarded shell still has network access because its model client
  is inside the same OS profile.
- Git patch sharing remains disabled. The existing regex redactor is not treated
  as sufficient protection for arbitrary repository content.

### Verification

- Added a deterministic child-environment test proving inherited and override
  bridge tokens are removed without dropping ordinary runtime variables.
- Expanded the real Claude macOS Seatbelt test to probe every protected
  credential path, restrict `.claude` settings writes, retain disposable
  workspace writes, and preserve project/sibling isolation. Added deterministic
  assertions for Codex's native workspace/read-only profiles and deny list.
- Ran a live verification room after the first implementation. It confirmed
  bridge-token removal and Claude's host-path denials, exposed the missing Codex
  deny policy and overly broad `.claude` write carve-out, and drove the
  refinements above before release. A second gate rejected nested Seatbelt for
  Codex, so Codex now uses its native `:workspace` permission profile. The final
  gate then confirmed both agents' environment, workspace, common credential,
  and cross-CLI directory boundaries and caught the final `.claude.json` mirror
  omission.
- Added rendered-HTML assertions for the new security and network disclosure.

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
