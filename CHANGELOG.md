# Changelog

Every Roundtable release represents one complete iteration: a visible agent
discussion or explicit user-directed capability, its implementation, and
verification of the resulting app. Versions advance in `v0.0.0.1` increments.

## [v0.0.0.34] — 2026-07-31

### Field finding

A real EDUTOOL review recovered after Claude re-authentication and completed its
retry, but the retained room phase stayed `retrying`. The other agents kept
working while owner steering was incorrectly rejected. The same long-running
turn also showed that a live provider process is observable while its private
reasoning progress is not.

### Implementation

- A successful retry clears the failed-turn record and atomically restores the
  session to `running` before the transcript advances.
- Owner steering is accepted again after recovery only when a future
  cross-examination prompt can actually receive it.
- Liveness copy reports only observable facts: process alive, elapsed time, and
  time since CLI output. Request-only activity explicitly says provider
  progress is not observable.

### Verification

- The retry integration test pauses the following Claude turn, proves the room
  is `running`, proves the failure record is gone, and proves a submitted note
  reaches the next cross-examination prompt before the discussion finishes.
- Status-copy coverage rejects the former unsupported `reasoning` claim and
  pins process, request, quiet-time, and exit wording.
- The full bridge/runtime suite, production lint, production build, rendered
  HTML checks, syntax checks, and whitespace validation pass.

## [v0.0.0.33] — 2026-07-31

### Field finding

A real EDUTOOL audit exposed two misleading failure boundaries. Claude's local
`auth status` probe reported logged in immediately before the provider rejected
the persisted OAuth token as revoked, while an iCloud-backed Roundtable checkout
left a living web compiler process that never bound its selected port.

### Implementation

- Revoked and expired OAuth/access-token failures now become bounded re-login
  guidance instead of a raw provider error.
- The message states that local CLI status can remain optimistic after a
  server-side revocation or expiry; Roundtable does not claim the startup probe
  made a provider request.
- A living web compiler with an unbound port now recommends relaunching from a
  local checkout when the source is on a synced or cloud-backed folder.

### Verification

- Authentication coverage reproduces the exact Claude 401 revoked-token text
  observed in the EDUTOOL room and proves the local-status boundary remains
  visible.
- Launcher coverage reproduces a healthy bridge beside a living, unbound web
  compiler and proves the targeted local-checkout guidance.
- The full bridge/runtime suite, production lint, production build, rendered
  HTML checks, syntax checks, and whitespace validation pass.

## [v0.0.0.32] — 2026-07-31

### Field finding

A real six-round self-review completed successfully but exposed two state
contradictions. A live steering note was labeled "Queued, never delivered"
before its eligible turn, and the completed session snapshot retained
`briefAudit.status: "running"` after the audited revision had finished.

### Implementation

- Live and exported steering copy now distinguishes waiting for the next turn
  from a note stranded by a terminal or archived room.
- A streamed human message is the client-side commit signal that removes its
  matching queued copy as soon as the bridge delivers it.
- Brief audits emit a final persisted state with a completion timestamp and a
  truthful `complete` or `stopped` status before the final outcome is exposed.

### Verification

- Steering integration coverage proves delivered notes leave the bridge queue;
  presentation coverage proves live and terminal labels remain distinct.
- Audited-revision and terminal replay coverage prove final audit status,
  timestamp, revision evidence, and event ordering.
- The full 130-test bridge/runtime suite, production lint, production build,
  rendered HTML checks, syntax checks, and whitespace validation pass.

## [v0.0.0.31] — 2026-07-31

### Discussion

A six-round self-review used Roundtable against its own source. The first
source-backed launch left a living web child without a bound port and then
removed a healthy bridge at the aggregate deadline. The first room also spent
two minutes traversing the dependency-heavy project three times while exposing
only an opaque `starting` phase. The audited consensus rejected a broad finding
database, fabricated snapshot IDs, adaptive stopping, specialist personas, and
new write authority. Existing evidence provenance and copy-on-write behavior
were already present; the reproducible gaps were supervision, repeated
validation work, and preparation visibility.

### Implementation

- Web startup binds the selected port strictly. Launcher readiness now tracks
  bridge readiness, web readiness, web-child state, and port state separately,
  then reports the component combination before bounded cleanup.
- Cached role workspaces clone from one validated session-start source. Source
  filtering, symlink containment, and Git-context materialization run once;
  dependency content remains available for offline checks.
- Clone cancellation, deadlines, the injected copy seam, role isolation, and
  the existing copy-on-write mode remain intact.
- Request-scoped broker checks still copy the current host project afresh. The
  documented boundary is explicit: cached roles can retain older Git context
  if the host changes during a meeting.
- The bridge and UI now expose a real `preparing` lifecycle with truthful
  `validating-source`, `cloning-role`, and `ready` stages without invented
  percentages.

### Verification

- Launcher coverage reproduces a healthy bridge beside a living, unbound web
  child and proves strict selected-port startup.
- Sandbox coverage proves one validation/materialization pass, three isolated
  role clones, retained dependencies, clone cancellation, source cleanup, and
  fresh broker visibility after a host-project mutation.
- Bridge and accessibility coverage prove preparation-stage reconnect state,
  stop-before-agent behavior, and truthful live announcements.
- The full bridge/runtime suite, production lint, production build, rendered
  HTML checks, syntax checks, and whitespace validation pass.

## [v0.0.0.30] — 2026-07-31

### Discussion

The Scion follow-up room reached consensus, but its audited brief revision
failed three times because the agents assigned a supported follow-up to the
"CourseMapper team" rather than one of Roundtable's five exact owner labels.
The original brief remained safe, but the supported action was lost.

### Implementation

- Initial synthesis keeps strict action-owner validation.
- The revision prompt repeats the exact owner enum and tells agents to use
  `Unassigned` for project or team labels.
- Audited revisions safely canonicalize an unknown owner to `Unassigned`
  instead of discarding the entire revised brief.

### Verification

- Parser coverage proves initial synthesis still rejects an unknown owner and
  revision mode canonicalizes it.
- The audited-revision integration test uses a real project-team owner, retains
  the action as `Unassigned`, and verifies the strengthened prompt.
- The full 123-test bridge/runtime suite, syntax checks, and whitespace
  validation pass.

## [v0.0.0.29] — 2026-07-31

### Discussion

During a real Scion code audit, the bridge became healthy but the Roundtable
web app’s first compile exceeded the fixed 60-second launcher deadline. The
launcher then stopped both healthy process trees. Agent liveness correctly
distinguished long, quiet reasoning from a dead CLI process once the room was
running; startup needed the same patience without becoming unbounded.

### Implementation

- The supervised launcher now allows three minutes for bridge and web
  readiness by default.
- Direct launchers may set `ROUNDTABLE_STARTUP_TIMEOUT_MS` from 1,000 through
  900,000 milliseconds; invalid values fail closed.
- One resolved deadline is threaded through bridge health, web health, and the
  aggregate launcher transaction, so the three checks cannot disagree.

### Verification

- Launcher coverage proves the three-minute default, a valid override, and
  rejection of too-small or nonnumeric values.
- The 123-test bridge/runtime suite and the focused 18-test launcher suite pass.
- Syntax checks for the changed launcher modules and whitespace validation
  pass. Production lint/build were attempted separately, but this host's
  cloud-backed source and dependency reads stalled while retained Roundtable
  rooms remained live, so this release makes no fresh lint/build claim.

## [v0.0.0.28] — 2026-07-31

### Discussion

The final EDUTOOL audit verified the repaired code but blocked release because
the new retry module appeared only as an untracked path in `status.txt`.
Reviewers could inspect the copied file, but `changes.patch` did not contain its
content, so the frozen evidence bundle could not reproduce the working tree it
was judging.

### Implementation

- Frozen Git context now adds bounded inline patches for untracked files.
- Metadata records the exact included and omitted untracked paths.
- Per-file, total-byte, and file-count limits prevent a large untracked tree
  from overwhelming the audit context; omitted paths remain explicit.
- Exact-HEAD evidence remains commit-only and never absorbs working-tree files.

### Verification

- Sandbox coverage proves an untracked module and its content appear in
  `changes.patch`, metadata names it, and `head-changes.patch` excludes it.
- Focused sandbox tests, all 122 bridge/runtime tests, JavaScript syntax,
  server-rendered page checks, and whitespace validation pass.

## [v0.0.0.27] — 2026-07-30

### Discussion

A real EDUTOOL audit included several long, quiet model turns. They completed
normally, but Roundtable exposed only an animated waiting state, so a user could
not tell patient reasoning from a dead CLI process. The resulting requirement
was to report observed process state without inventing a heartbeat or treating
silence as failure.

### Implementation

- Added ephemeral liveness events around contributions, synthesis, brief audits,
  and dissent review, refreshed every five seconds and restored in live session
  snapshots and event-stream reconnects.
- The real process runner now records when the child process started, its last
  stdout or stderr activity, its timeout deadline, and its exit transition.
- The thinking card distinguishes workspace preparation, an active request, and
  a live CLI process. Live processes show elapsed reasoning time and, after
  twenty quiet seconds, time since their last output.
- Screen-reader turn announcements receive the same liveness detail.
- Liveness events remain runtime-only and are not written to local discussion
  history.

### Verification

- Added focused text-formatting coverage for long active reasoning and exited
  processes.
- Added bridge coverage proving active-process evidence is available from a
  recoverable session snapshot while the model call remains quiet.
- Full bridge/runtime tests, lint, production build, rendered-page checks, and
  whitespace validation pass.

## [v0.0.0.26] — 2026-07-30

### Discussion

A five-round EDUTOOL release audit showed two Roundtable product gaps in real
use. A completed room still holding the default ports could block the next
explicit launch, and disposable workspaces intentionally omitted `.git` but
gave reviewers no equivalent evidence for distinguishing a pull request's
changes from pre-existing code.

### Implementation

- The personal plugin launcher now selects separate available bridge and web
  ports for each invocation while preserving explicit environment overrides.
- The app launcher accepts and validates a configured web port and opens the
  matching room URL.
- Git projects now materialize a sanitized `.roundtable-context` directory in
  every disposable workspace. It records branch/base metadata, recent log and
  status, plus committed branch and tracked working-tree patches without
  copying `.git`, Git configuration, or untracked file contents.
- Agent prompts explicitly route PR and release reviews through that code
  evidence and require reviewers to separate changed-code findings from
  pre-existing observations.
- Git context generation is best-effort: missing metadata, timeouts, or large
  repositories cannot prevent a discussion from starting.
- The README now defines an evidence-based comparison between a human working
  with one coding model and a human delegating to Codex as a butler that
  consolidates a multi-model Roundtable and manages delivery. Robust accepted
  outcomes, dimension-level accuracy and coverage, adversarial resilience,
  evidence traceability, preserved dissent, and consolidation gain are primary;
  time and fixed CLI subscription fees are secondary constraints. The README
  states explicitly that v0.0.0.26 has not yet established a causal quality or
  productivity lift.

### Verification

- Added launcher coverage for default, configured, and invalid web ports.
- Added a real Git fixture proving branch and working-tree patches are visible
  in the sandbox while `.git` remains absent.
- All 117 bridge/runtime tests, lint, the production build, both rendered-page
  checks, and whitespace validation pass with no skips.

## [v0.0.0.25] — 2026-07-30

### Discussion

A two-round Roundtable architecture review challenged five hypotheses: fixed
sequential order creates anchoring, rolling context can silently hide early
decisions, Codex-only synthesis concentrates judgment and failure, disposable
copies may cost too much, and an independent opening followed by
cross-examination may produce better deliberation.

The room agreed to preserve the sandbox model, correct observability and
synthesis resilience first, then make the sealed-first-pass experiment the
default architecture. It corrected one proposal during discussion: dissent
cannot simply run without a brief because its task is specifically to audit a
frozen brief. The accepted recovery is multi-role synthesis fallback followed
by brief audit. The owner then requested the complete architecture, including
one bounded audited revision, as the next release.

### Implementation

- Replaced the first sequential round with a checkpointed sealed opening. All
  three participants receive the same immutable discussion input hash, peer
  answers remain hidden, retries reuse the exact frozen prompt, and completed
  openings remain independently recorded.
- Turned later rounds into cross-examination over revealed labeled positions.
  Presentation order is deterministic but shuffled per reader and turn, while
  canonical `M#` identities remain stable.
- Added a strict 48,000-character transcript cap with included, omitted,
  shortened, and presentation-order telemetry. Partial context is attached to
  the resulting message, shown in the room, persisted in history, and exported.
- Added explicit escaped untrusted-data boundaries for discussion, draft, and
  audit inputs. Live agent bodies now receive credential redaction and
  disposable-path scrubbing before entering peer prompts or snapshots.
- Replaced Codex-only completion with recorded Codex → Claude → Antigravity
  fallback attempts. Two non-synthesizing participants independently audit the
  first valid draft; supported concerns permit exactly one fallback-capable
  revision, while the original draft, audit findings, provenance, and attempts
  remain visible and exportable.
- Persisted sealed-batch and brief-audit checkpoints in append-only history and
  replayed them during live stream recovery without exposing them as transcript
  messages.
- Updated live status, message metadata, completion UI, Markdown export, and
  documentation for sealed openings, cross-examination, fallback synthesis,
  audit, revision, and context coverage.

### Verification

- Added focused coverage for strict single-message overflow, omitted labels,
  deterministic per-reader ordering, escaped boundary injection, shared sealed
  input hashes, steering isolation, checkpointed retry, live-body redaction,
  synthesis fallback, sealed audits, one revision, and history reconstruction.
- All 115 bridge/runtime tests, lint, the production build, both rendered-page
  checks, and whitespace validation pass with no skips.

## [v0.0.0.24] — 2026-07-30

### Request

Allow the owner to add more rounds while a Roundtable meeting is running,
without losing the existing transcript or opening a continuation room.

### Implementation

- Added an authenticated live-session extension route that accepts one through
  five additional rounds and updates the active turn loop in place.
- Added an **Add rounds** control to the live room summary. The progress rail,
  session snapshot, and recovered room all adopt the new turn total.
- Preserved the locked project, topic, model, effort, attachment, history, and
  dissent configuration; only the live round count can grow.
- Bounded a discussion to twenty total rounds and rejected extensions after the
  meeting has entered synthesis or a terminal state.

### Verification

- Bridge coverage holds an active turn, adds two rounds, and proves the original
  room completes all nine turns with intact round numbering.
- Validation coverage rejects malformed additions and post-completion changes.
- UI source and rendered-page coverage pin the control, endpoint, and
  transcript-preservation disclosure.

## [v0.0.0.23] — 2026-07-30

### Request

Remove the extra start confirmation after an explicit `@roundtable` invocation.
The invocation itself is the user's authorization to begin the requested local
discussion.

### Implementation

- Added a validated `--start` launcher flag that creates the bridge session
  immediately with the requested project, topic, and round count plus each
  CLI's configured model and effort defaults.
- Added the live session ID to the connected room URL so the UI recovers the
  already-running discussion instead of showing the setup confirmation.
- Kept automatic launches discussion-only with no attachments, dissent review,
  or local-history retention.
- Removed server/client launch-context hydration drift by consuming all launch
  parameters after mount before connecting to the bridge.
- Updated the personal Roundtable plugin contract so explicit plugin invocation
  always passes `--start`.

### Verification

- Launcher coverage now checks `--start`, exact session URL round-tripping,
  bridge payload construction, authorization, and returned session identity.
- The full bridge suite, lint, production build, rendered-page checks, plugin
  validation, and a real three-round cross-project launch remain the release
  gate.

## [v0.0.0.22] — 2026-07-30

### Request and platform audit

Request: make Roundtable reusable from any other Codex project with the prompt
`use @roundtable for this project`.

The current Codex manual distinguishes the two explicit surfaces: the desktop
plugin picker can select `@Roundtable`, while Codex skills use the canonical
`$roundtable` mention. Installed skills may also trigger implicitly from a
matching natural-language request. A personal skills-only plugin therefore
covers the requested workflow without adding an MCP server, remote service,
connector authentication, or broader tool permission.

### Independent audit

- Accepted a personal `roundtable` plugin with one narrowly scoped bundled
  skill. The workflow needs repeatable local instructions and a launcher, not a
  new network tool.
- Accepted current Git-root resolution with the current working folder as the
  non-Git fallback. “This project” must never silently become the Roundtable
  source repository merely because the launcher lives there.
- Accepted project, topic, and round prefilling through validated launcher
  arguments. Values are encoded through `URL` and `URLSearchParams`, then the
  existing app removes the launch URL from browser history after consuming it.
- Kept the visible **Start discussion** confirmation. Plugin invocation may
  select and prefill a project, but it must not silently spend model calls or
  bypass the user's model, effort, history, dissent, attachment, and rounds
  review.
- Rejected a custom MCP server and automatic implementation pipeline. Neither
  is required to open a local discussion, and both would materially broaden the
  plugin's authority.

### Implementation

- `npm run talk --` and direct `talk.mjs` launches now accept `--project`,
  `--topic`, and `--rounds 1-5`, plus bounded validation and `--help`.
- `talk.mjs` now locates the Roundtable repository from its own module path, so
  it can be called while another repository remains the active working
  directory.
- The connected room URL carries encoded launch context. Setup initializes its
  project, goal, and rounds from that context before authenticated bridge
  connection, while preserving the bridge-provided project fallback for
  ordinary launches.
- Created and installed the personal `roundtable` plugin with an implicitly
  discoverable `$roundtable` skill and the exact requested phrase in its trigger
  description. Its no-shell Node launcher supports a `ROUNDTABLE_HOME` override
  and forwards shutdown to the supervised Roundtable launcher.
- Added cross-project usage, explicit mention syntax, the retained confirmation
  boundary, direct CLI fallback, and relocation guidance to the README.

### Verification

- The personal skill and plugin pass the skill and plugin validators, and
  `codex plugin list` reports `roundtable@personal` installed and enabled.
- Twelve focused launcher tests pass, including relative project resolution,
  missing/unknown/out-of-range rejection, and exact URL round-tripping for
  paths and goals containing spaces and punctuation.
- All 108 bridge tests pass with no skips on the unnested macOS host. Lint, the
  production build, both rendered-page checks, and `git diff --check` pass.
- A live launch invoked the installed plugin's script from the separate
  `Quicky Resume` repository. The supervised room became ready with all three
  CLIs, and its encoded launch context selected that repository, the requested
  smoke-test goal, and one round—not the Roundtable source directory.
- Stopping the plugin-owned process removed both port 3000 and port 4317
  listeners.

### Remaining limitations

- Codex uses `$roundtable` for the unambiguous bundled-skill mention. The
  `@Roundtable` form depends on selecting the desktop plugin mention; plain text
  containing `@roundtable` relies on implicit skill matching.
- The personal plugin is local to this workstation and points to this local
  Roundtable checkout by default. Moving the checkout requires
  `ROUNDTABLE_HOME` and reinstalling or refreshing the plugin.
- Invocation prefills the setup room but deliberately does not press
  **Start discussion**.

## [v0.0.0.21] — 2026-07-30

### Conversation

Prompt: audit v0.0.0.20 for one concrete, highest-leverage startup reliability
and developer-experience improvement at the CLI capability and authentication
probe boundary. Agents were asked to inspect the bridge, launcher, related
tests, README, and latest changelog; decide whether every probe needs a bounded
deadline, output limit, termination contract, and sanitized diagnostic; preserve
fail-closed authentication and capability behavior; never expose command output,
credentials, bridge keys, or broader environment state; consider concurrent
probes, slow valid CLIs, macOS process behavior, and testability; use optional
sandboxed checks when useful; and avoid speculative refactors.

Across two rounds and six complete contributions, Codex, Claude, and
Antigravity agreed that the launcher-wide 60-second deadline did not bound
individual probe memory or identify the stalled command. Codex found nine
concurrent version, help, model, and authentication probes with unbounded output,
plus the later Codex permission-profile probe. Claude connected the required
timeout and escalation behavior to the bridge's existing managed-process
pattern, identified diagnostic precedence as necessary to avoid calling a
timeout an old CLI or missing login, and then found a third sequential barrier:
the initial `sandbox-exec` capability check. Antigravity confirmed that a
20-second per-probe limit could therefore consume all three 20-second stages and
lose the intended diagnostic behind the aggregate launcher deadline.

Round two corrected an early claim that vinext compilation was serialized
behind bridge probing: `talk.mjs` starts both children back-to-back. The decisive
15-second rationale was instead the three sequential probe barriers before the
bridge listens, leaving 15 seconds inside the aggregate deadline. The complete
transcript and coverage-preserving Completion Brief were read only after all six
turns and synthesis finished. The brief accurately recorded that exact timeout
length did not receive explicit final consensus from Codex after the third
barrier was found.

### Independent audit

- Accepted a side-effect-free bounded-probe helper in the bridge layer. The
  bridge owns probe labels, filtered CLI environments, capability semantics, and
  health diagnostics; no launcher protocol or permission boundary needed to
  change.
- Accepted a fixed 15-second deadline rather than the initially proposed
  20 seconds. Repository inspection confirmed three potentially sequential
  child stages—`sandbox-exec`, the concurrent CLI probe group, and the Codex
  permission guard—before `server.listen`; three 20-second stalls can consume
  the launcher's entire 60-second transaction.
- Accepted a 64 KiB combined stdout/stderr byte limit with immediate failure,
  direct-child `SIGTERM`, two-second `SIGKILL` escalation, and resolution only
  after the child closes. Infrastructure failures discard all captured bytes so
  partial help or model output cannot reach downstream parsers.
- Accepted infrastructure-only reasons for timeout, output limit, and spawn
  failure. Fixed caller-owned labels take precedence over derived compatibility
  or authentication states, while ordinary nonzero exits still carry their
  prior semantics and login guidance.
- Accepted non-gating, sanitized warnings for failed version probes. A missing
  version must not disable an otherwise usable CLI, but a stalled or noisy
  version command should still be identifiable in the supervised terminal.
- Narrowed the proposed role-aware helper. The helper accepts an already
  filtered environment, keeping role and credential policy in `bridge.mjs`
  rather than duplicating security decisions in process utility code.
- Rejected retaining the head or tail of overflowed output. Because overflow is
  an infrastructure failure, returning any partial bytes could change model or
  capability parsing; the implementation retains output only for bounded,
  normally closed probes.
- Rejected detached per-probe process groups and launcher changes. Probes remain
  inside the bridge's launcher-owned group for aggregate cleanup, while the
  bounded helper targets its direct child for the local deadline.

### Implementation

- Added `scripts/probe-command.mjs` with injectable defaults for a 15-second
  timeout, 64 KiB combined output, and two-second termination grace. It returns
  structured results without exception or command-output text and uses fixed
  formatting for diagnostics.
- Routed the macOS project-guard capability check, nine concurrent CLI probes,
  and the sequential Codex permission-profile probe through the same bounded
  helper. CLI probes still receive only their existing role-scoped environment.
- Gave capability, authentication, model-access, and permission-profile
  infrastructure failures precedence in health diagnostics. Version and
  project-guard probe failures emit sanitized startup warnings without exposing
  arguments, paths, environment values, output, or raw spawn errors.
- Added eight direct regressions for normal and nonzero exits, timeout with
  discarded output, combined-stream overflow, TERM-resistant escalation,
  independent concurrency, fixed secret-free diagnostics, precedence and
  missing-path behavior, and ignored-output capability checks. Updated the
  environment contract test and enumerated the new file in `test:bridge`.
- Updated the README's release and startup reliability claims.

### Verification

- All 105 bridge tests pass with no skips on the unnested macOS host, including
  Claude, Codex, Antigravity, launcher, broker-network, credential, symlink,
  attachment, history, recovery, and host containment regressions.
- All 13 focused probe and environment tests pass. Lint is clean, the production
  build succeeds, both rendered-page checks pass, and `git diff --check` is
  clean.
- Live validation restarted the real supervised launcher on bridge port 4417
  without opening a browser. Authenticated health reported the macOS project
  guard and all three real CLIs available, the connected room returned HTTP 200,
  and `Control-C` removed both listeners.
- A second live launch placed a temporary `/usr/bin/yes` alias ahead of the real
  Claude executable. All noisy probe children hit the 64 KiB limit and exited;
  bridge health failed Claude closed with
  `Claude capability probe exceeded the 64 KiB output limit.`, the terminal
  added only the fixed version warning, and no captured output or fixture
  process survived. The temporary alias and directory were removed.
- No visible room behavior changed, so this cycle used authenticated live HTTP,
  real launcher fault injection, and the existing rendered-page suite rather
  than browser interaction QA.

### Remaining limitations

- The 15-second deadline is intentionally fixed. An unusually slow but valid CLI
  can be marked unavailable for that launch and must be retried by restarting
  Roundtable; there is no runtime probe retry or supported timeout override.
- Probe termination targets the direct child. A CLI that creates and detaches
  its own descendant could leave that descendant briefly alive; the supervised
  launcher's process-group cleanup remains the aggregate fallback when startup
  itself fails.
- Version-probe infrastructure failures are warnings rather than availability
  failures. Capability, authentication, model-access, permission-profile, and
  project-guard checks remain fail-closed.

## [v0.0.0.20] — 2026-07-30

### Conversation

Prompt: audit v0.0.0.19 for the single highest-leverage privacy, recovery, and
testing improvement at the boundary between an active `keepHistory` discussion
and authenticated record deletion or clear. Agents were asked to inspect the
bridge, history store, UI actions, latest changelog, README, and tests; determine
what queued or future writes do after deletion; consider orphan NDJSON bytes,
index consistency, restart behavior, UI semantics, status codes, and storage
failures; use optional sandboxed checks when useful; and avoid the just-released
launcher and stream-recovery work or any permission, credential, sandbox, or
authentication change.

Across two rounds and six complete contributions, Codex, Claude, and
Antigravity agreed that deletion was not yet a truthful browser contract.
Codex traced the event-file recreation path: the store appended a non-creation
event before checking whether its ID was still indexed. Claude found that the
browser path was currently blocked by CORS because DELETE was not advertised,
and that terminal session phase was insufficient because the final status write
could still be queued. Antigravity confirmed the store and route paths and ran
the full bridge suite twice through the Roundtable broker; each nested run
reported 87 passes and three environment-skipped host containment probes.

The second round refined the failure model. Codex corrected the claim that an
ordinary post-deletion judgment recreates data: the route first reads the
archive, so only a concurrent get-delete-append interleaving reaches the store
guard. Claude identified index/file divergence when deletion I/O fails and the
startup path that could otherwise recreate an interruption-only file for a
missing transcript. The complete transcript and coverage-preserving Completion
Brief were read only after all six turns and synthesis finished.

### Independent audit

- Accepted an explicit `historyClosed` lifecycle barrier. A retained session
  begins closed only when history is disabled; otherwise record deletion and
  clear return 409 until the session's serialized write chain drains in
  `finally`. Merely checking a terminal phase was rejected because the final
  durable status can still be pending.
- Accepted rejecting every non-`session.created` append for an unindexed ID
  before `appendFile`. This closes both queued live-write and concurrent
  judgment races without recreating invisible transcript bytes.
- Accepted advertising DELETE in CORS and parsing the bridge's response in the
  UI. The old interface issued an authenticated cross-origin DELETE that
  browsers had to preflight, but the bridge advertised only GET, POST, and
  OPTIONS; network rejection was also outside the UI's exception handling.
- Accepted removing index entries whose exact NDJSON is already missing before
  restart interruption recovery. This is loss-free because the referenced
  transcript bytes are absent and prevents initialization from creating a new
  status-only phantom file.
- Narrowed the proposed “commit-last” deletion rule. Assigning the in-memory
  index last does not repair a file removal followed by an index-write failure.
  The store now commits the replacement index before removals, rolls the prior
  durable index back if an exact removal fails, and, for a partially failed
  clear, rebuilds the index from the transcript files that actually remain.
- Accepted sanitized 500 responses for unexpected storage and request failures
  while retaining specific 400 request validation, 404 absence, and 409
  concurrency semantics. Absolute history paths no longer reach the browser
  through a catch-all error.
- Rejected unconditional startup deletion of unindexed NDJSON. Such a log can
  be the recoverable result of an interrupted or failed index replacement;
  deleting it would turn metadata loss into transcript loss. Recovery or
  quarantine of legacy unmatched logs remains future work.
- Rejected disabling deletion controls based only on visible status as an
  incomplete substitute for the server barrier. Multiple tabs, direct API use,
  and the terminal-but-draining window still require the bridge invariant.

### Implementation

- Added `historyClosed` to retained sessions, set it only after the history
  chain settles, and made both authenticated deletion routes reject targeted
  active or draining history with actionable 409 messages.
- Added a pre-append indexed-record guard with a stable concurrency error,
  staged replacement-index writes for delete and clear, rollback or surviving-
  file reconciliation on removal failure, and missing-file reconciliation
  before restart status writes.
- Added DELETE to authenticated CORS preflight. History delete and clear now
  catch network failures, parse server diagnostics, and display the specific
  live-session conflict instead of a generic or unhandled failure.
- Changed unexpected bridge request failures from raw 400 responses to a
  sanitized 500, while malformed JSON, oversized bodies, and invalid project
  selection retain client-error behavior.
- Added direct regressions for CORS preflight, active record and clear barriers,
  deletion after the write chain closes, sanitized storage failures,
  append-after-delete, replacement-index failure, removal rollback,
  missing-transcript startup repair, and UI response parsing.
- Updated the README's version and local-history privacy and recovery claims.

### Verification

- All 97 bridge tests pass with no skips on the unnested macOS host, including
  Claude, Codex, Antigravity, broker-network, credential, symlink, attachment,
  history, recovery, launcher, and containment regressions.
- All 32 focused bridge-core and history-store tests pass. Lint is clean, the
  production build succeeds, both rendered-page checks pass, and
  `git diff --check` is clean.
- Live validation restarted the real supervised launcher on bridge port 4417
  so the Node bridge—not only the hot-reloaded web app—contained this release.
  Authenticated OPTIONS returned `GET, POST, DELETE, OPTIONS`; a fresh retained
  session returned 409 for both record deletion and clear while running, stopped
  cleanly, then deleted with 200 after its write chain closed. Its exact NDJSON
  was absent and the archive returned to its original 28 records.
- The in-app browser connected to all three available CLIs, opened the real
  28-record History drawer, exposed all record controls, contained neither live
  smoke artifact after cleanup, and logged no warnings or errors. An initial
  pre-restart smoke deliberately reproduced the old bridge's orphan path; the
  single 539-byte run-created orphan was removed before patched validation.

### Remaining limitations

- Delete and clear are serialized and roll back ordinary I/O failures, but the
  filesystem and index are not one crash-atomic transaction. If the process
  terminates between replacement-index persistence and byte removal, an
  unindexed log is intentionally preserved rather than silently deleted.
- Legacy unindexed logs are not listed, automatically reconstructed, or
  automatically deleted. A future recovery tool should validate a leading
  `session.created` event and offer explicit reconstruction or quarantine.
- A clear that encounters an unusual partial removal failure returns 500 and
  rebuilds its index from the files still present; records already removed
  remain deleted rather than being recreated from stale metadata.

## [v0.0.0.19] — 2026-07-30

### Conversation

Prompt: audit v0.0.0.18 for the single highest-leverage startup reliability
and developer-experience improvement at the boundary among `npm run talk`,
bridge capability and authentication probes, child-process readiness, and
shutdown or failure reporting. Agents were asked to inspect the current
scripts, package metadata, README, latest changelog, and tests; consider hung
CLI probes, partial startup, port conflicts, premature or signal exits, leaked
descendants, and actionable diagnostics; use optional sandboxed checks when
useful; and avoid the just-released EventSource recovery work or any change to
permission, credential, sandbox, or authentication boundaries.

Across two rounds and six complete contributions, Codex, Claude, and
Antigravity converged on a transactional launcher invariant: Roundtable must
not advertise or open the room until vinext is ready and the newly spawned
bridge returns authenticated health, while every earlier failure must abort
and clean up both process trees. Codex identified that the launcher opened on
vinext's `Local:` output alone even though the bridge still had capability,
authentication, containment, and history initialization to finish. Claude
showed that authenticated `/health` already distinguishes the fresh bridge
from an old listener and found that the launcher ignored premature exit code
zero and signal exits. Claude and Antigravity also found that the launcher
hardcoded port 4317 despite the bridge honoring `ROUNDTABLE_BRIDGE_PORT`, and
that direct-child termination did not cover vinext descendants.

No participant requested a brokered check or reported a sandbox check. The
complete transcript and Completion Brief were read and audited only after all
six turns and synthesis finished.

### Independent audit

- Accepted joint vinext and authenticated bridge readiness. `/health` is
  authorized before it returns `{ "ok": true }`, and the launcher creates a
  fresh 192-bit key, so that response is the existing authoritative proof that
  this launch completed bridge initialization and successfully bound.
- Accepted immediate failure for 401 or 403 responses with a port-conflict
  diagnostic. Other HTTP responses, malformed JSON, and successful responses
  without `{ "ok": true }` are also rejected as incompatible listeners rather
  than being mistaken for this bridge.
- Accepted deriving and validating the launcher port from
  `ROUNDTABLE_BRIDGE_PORT`, then explicitly passing the normalized value to the
  bridge child. This removes the real split-brain path where the bridge listened
  on one port and the room advertised another.
- Accepted treating child spawn errors, nonzero exits, premature clean exits,
  and signal exits as failures both during and after startup. The prior
  `if (code)` condition ignored the latter two cases and could retain a partial
  stack.
- Accepted POSIX process groups, Windows tree termination, a two-second
  graceful window, and bounded forced cleanup. These targets are restricted to
  the exact child PIDs started by the launcher and do not broaden agent or
  bridge process permissions.
- Narrowed the Completion Brief's proposed health-shape validation to
  authenticated status plus `ok === true`. Binding the launcher to model,
  history, or containment fields would add brittle coupling without additional
  identity evidence.
- Deferred per-command CLI probe deadlines and output caps. A separate timeout
  per probe could improve diagnostics later, but the accepted 60-second
  launcher transaction already bounds the whole startup and terminates the
  bridge process group, including a stuck probe.
- Rejected treating `EADDRINUSE` as a permanently hung stack. The bridge's
  unhandled server error already exits nonzero; the actual product defect was
  that the browser could open first and show an authentication symptom before
  the launcher noticed the bridge exit.

### Implementation

- Added a zero-dependency launcher module with validated port resolution,
  cancellable authenticated health polling, an overall joint-readiness barrier,
  actionable listener classification, exact zero/signal exit descriptions,
  process-tree signaling, graceful waiting, and SIGKILL escalation.
- Changed `npm run talk` to launch the bridge and web app in their own POSIX
  process groups, retain a failure race from the first spawn, recognize vinext
  readiness across output chunks, and print or open the room URL only after
  both readiness promises complete.
- Kept the generated bridge key out of diagnostics. Startup cancellation aborts
  health polling, while an unexpected child failure after readiness reports the
  component and reuses the same bounded cleanup path as `Control-C`.
- Added nine direct launcher regressions for default, custom, and invalid
  ports; transient health retries; rejecting and unrelated listeners; joint
  readiness ordering; premature zero and signal exits; startup deadline;
  negative-PID process-group targeting; and graceful-to-forced cleanup.
- Updated the README release and startup capability claims.

### Verification

- All 90 bridge tests pass with no skips on the unnested macOS host, including
  launcher, Claude, Codex, Antigravity, broker-network, credential, symlink,
  attachment, history, recovery, and containment regressions.
- All 9 focused launcher tests pass. Lint is clean, the production build
  succeeds, both rendered-page checks pass, and `git diff --check` is clean.
- Live validation ran the real launcher without opening a browser and with
  `ROUNDTABLE_BRIDGE_PORT=4417`. It withheld the final room URL until bridge
  health and vinext readiness, advertised port 4417, returned authenticated
  health with all three CLIs available, and served the rendered room.
- A concurrent validation launch against occupied port 4417 exited 1 with the
  intended conflict diagnostic, printed no room URL, created no extra listener,
  and did not disturb the original app. `Control-C` then exited zero and removed
  the bridge, vinext, and workerd descendants; ports 3000, 3001, 4317, and 4417
  were all free.

### Remaining limitations

- The startup deadline is intentionally launcher-wide. The error can identify
  a likely stuck capability or authentication probe, but it does not yet name
  which individual CLI command consumed the deadline.
- POSIX shutdown uses isolated process groups and Windows uses `taskkill /T`;
  the current host directly exercises and unit-tests the POSIX path, while the
  Windows branch is structurally covered but was not host-validated in this
  release.
- No visible room component changed, so this cycle used real launcher/HTTP
  validation and the existing rendered-page suite rather than browser
  interaction QA.

## [v0.0.0.18] — 2026-07-30

### Conversation

Prompt: audit v0.0.0.17 for one highest-leverage reliability, recovery, or
performance improvement at the local live-stream boundary during long-running
CLI turns. Agents were asked to inspect the EventSource recovery flow, bridge
ticket lifecycle, SSE replay and cleanup, latest changelog, and tests; consider
dropped streams, stale state, browser sleep/wake, one-use tickets, long silent
turns, and slow clients; use optional sandboxed checks when useful; and avoid
speculative infrastructure or any change to permission, credential, or
authentication boundaries.

Across two rounds and six complete contributions, Codex, Claude, and
Antigravity converged on a client-owned recovery contract. Codex identified the
uncancelled delayed recovery that could restore an old session after the user
reset or started another room. Claude showed that the existing one-shot catch
also deleted the only saved session pointer after one transient failure, and
that the initial connection path incorrectly treated a restoration failure as
a bridge-authentication failure. Antigravity confirmed those paths against the
source. In the second round, Claude found the decisive ticket failure: the
client closed its EventSource before requesting a fresh one-use ticket but left
the closed object in `streamRef`, so a failed ticket request had neither a live
source nor an `onerror` capable of scheduling another attempt.

No participant requested a brokered check or reported a sandbox check in this
discussion. The complete transcript and Completion Brief were audited only
after all turns and synthesis finished.

### Independent audit

- Accepted a session-generation guard and cancellable recovery timer because
  reset, successful session creation, connection-target changes, archive
  selection, and unmount are real ownership boundaries. Results and event
  handlers from an older generation now fail closed before mutating UI state.
- Accepted self-scheduled transient retries with capped 0.9, 2, 5, and
  10-second delays. A finite three-attempt limit was rejected because an
  hour-retained bridge session should not be abandoned after a short sleep or
  network outage; the delay caps while retry ownership remains bounded by the
  current room.
- Accepted clearing the stream reference immediately when closing it and
  routing snapshot, history, and ticket HTTP status through a small
  classification helper. Network failures and other nondefinitive responses
  retain the session pointer; only a definitive absence clears it.
- Accepted treating 401 and 403 as authorization failures that stop automatic
  retry and reopen connection setup. Narrowed the Completion Brief's open
  question by preserving the saved session ID: after a bridge restart issues a
  new key, that ID is still required to resolve the interrupted local archive.
- Accepted advancing ownership only after a new discussion is successfully
  created. Invalidating the current room before the create request succeeds
  would turn an ordinary validation or network failure into state loss.
- Accepted separating successful health discovery from asynchronous session
  restoration. Transient restoration and ticket failures no longer erase a
  valid bridge health result or falsely reopen the key modal.
- Narrowed Codex's initial claim that overlapping same-session streams corrupt
  message state: stable message IDs already deduplicate replay. The ownership
  guard still removes the socket leak and prevents stale status or
  cross-session mutation.
- Rejected heartbeats, `Last-Event-ID`, bridge protocol changes, and new
  DOM-testing dependencies. The bridge already replays complete bounded room
  state, terminal streams close before client registration, localhost has no
  proxy idle timeout, and visibility/online listeners add no protection while
  browser JavaScript is suspended.

### Implementation

- Added a zero-dependency recovery module with typed HTTP status retention,
  missing/authorization/transient classification, capped retry delays, and a
  testable session-generation ownership predicate.
- Added generation, owned-session, and recovery-timer refs to the room. Every
  snapshot fetch, history fallback, ticket fetch, stream creation, message
  handler, and error handler verifies that it still owns the current session.
- Replaced the one-shot EventSource error timer with a recovery chain that
  fetches a fresh snapshot before each fresh ticket, survives ticket-request
  failures, and keeps retrying transient failures at a capped interval.
- Closed and nulled replaced streams as one operation. A source that loses
  ownership closes itself, and terminal status clears both the source ref and
  any pending recovery timer.
- Kept definitive missing-session archive fallback, but now distinguishes
  unavailable history from transient or authorization failures before removing
  the saved session ID.
- Isolated initial restoration from bridge health discovery and invalidated
  live ownership before showing a selected archive, preventing a background
  live stream from mutating the read-only archived view.
- Added four direct helper regressions and source/rendered contracts for new
  session ownership, stale-result guards, timer cleanup, closed-stream refs,
  archive replacement, and preservation of recoverable session IDs.

### Verification

- All 81 bridge tests pass with no skips on the unnested host, including the
  Claude, Codex, Antigravity, broker-network, credential, symlink, attachment,
  history, retry, and macOS containment regressions.
- All 4 focused recovery tests pass. Lint is clean, the production build
  succeeds, both rendered-page checks pass, and `git diff --check` is clean.
- Browser QA against the real local bridge opened the completed six-message
  discussion and Completion Brief, confirmed the connected setup and archived
  room, verified 6-of-6 progress and the labeled keyboard-focusable transcript
  log, and found no console warnings or errors.

### Remaining limitations

- The generation and retry arithmetic are directly unit-tested, while React
  wiring is covered through build, source contracts, and live browser QA. The
  repository still has no DOM event harness that can deterministically suspend
  a browser and inject a mid-ticket network failure.
- Retries intentionally continue at a maximum 10-second interval while the
  page still owns a nonterminal session. Reset, room replacement, archive
  selection, or unmount invalidates ownership; terminal completion,
  missing-session resolution, and authorization failure stop pending recovery.
- No heartbeat was added. A dropped local connection is detected by
  EventSource and repaired from a fresh snapshot; a fully suspended browser
  cannot run either heartbeat or recovery code until it resumes.

## [v0.0.0.17] — 2026-07-30

### Conversation

Prompt: audit v0.0.0.16 for one highest-leverage accessibility and live-room
UI/UX improvement, especially the dynamic transcript, turn/progress status,
focus and announcement behavior, and motion-aware auto-scroll. Agents were
asked to ground claims in the current page, styles, bridge events, changelog,
and tests; inspect the project; use optional sandboxed checks when useful; and
avoid cosmetic churn or changes to permission and credential boundaries.

Across two rounds and six complete contributions, Codex, Claude, and
Antigravity converged on one accessible live-transcript contract. Codex found
that the bridge emits clean turn-start and turn-completion boundaries that the
UI exposed only visually. Claude showed that making the whole transcript a
polite live region would duplicate announcements, read hundreds of words per
reply, and replay restored messages after a reconnect. Claude also found that
the overflowing transcript was not keyboard-focusable. Later turns corrected
the progress wording, focus-ring specificity, stable status-node placement,
and the test strategy for a setup-only server render.

Antigravity's two bridge-brokered `npm run test:bridge` checks passed with 67
tests and 3 environment-dependent containment skips inside the nested broker.
Codex separately reported a successful production build and two rendered-page
checks; its attempted local server bind was blocked by the participant sandbox.
Those agent records were treated as discussion evidence, not as the release
gate.

### Independent audit

- Accepted one stable, visually hidden atomic status region because it announces
  concise turn starts, replies, retries, synthesis, dissent review, and terminal
  states without moving keyboard focus.
- Accepted a labeled `role="log"` transcript only with `aria-live="off"`.
  This preserves sequential-log semantics while preventing full-reply,
  duplicate, reconnect, and archive announcements.
- Accepted `tabIndex={0}` only together with a dedicated inset
  `:focus-visible` ring. The transcript is a real overflow scroll region, and
  an invisible new tab stop would have been a regression.
- Accepted native progressbar value semantics and wording based on completed
  turns. The bridge uses the same `turn` value as a zero-based current index at
  start and as the completed count after reply, so “N of M turns complete” is
  accurate in both states.
- Accepted selecting instant programmatic scrolling when
  `prefers-reduced-motion: reduce` matches. The previous explicit
  `behavior: "smooth"` could not be overridden by the CSS media rule.
- Rejected making the transcript itself polite or automatically shifting focus
  as disruptive and duplicative.
- Narrowed claims about “one announcement per reply” to deterministic pure text
  derivation plus rendered/source contracts. The repository has no browser
  accessibility event harness, so unit tests cannot prove assistive-technology
  queue behavior.
- Rejected the Completion Brief's unresolved zero-maximum progress question as
  inapplicable: the progress rail renders only in live or archived sessions,
  both of which have a positive configured turn count.
- Added one independent correction not raised in the final brief: queued human
  steering is excluded when choosing the latest agent author, so it cannot be
  announced as an agent reply.

### Implementation

- Added a pure live-status formatter for correctly indexed start, completion,
  failed-turn, retry, synthesis, review, and terminal announcements. Setup,
  preview, and archive modes deliberately return silence.
- Mounted the live status node before the setup/session branch so assistive
  technology can register it before the first turn changes its text.
- Made the transcript a labeled, focusable log with live reading disabled and a
  visible focus ring drawn inside the scroll port.
- Replaced the progress rail's ineffective generic label with progressbar
  minimum, maximum, current-value, and completed-turn text.
- Preserved the existing 72-pixel live-edge gate while routing reduced-motion
  users to instant auto-scroll and other users to the existing smooth behavior.
- Added seven direct status and motion tests to the enumerated bridge suite, plus
  server-rendered and source/style contract checks.
- Updated the README's release and accessibility capability claims.

### Verification

- All 77 bridge tests pass with no skips on the unnested host, including the
  Claude, Codex, Antigravity, broker-network, attachment, history, retry,
  credential, and macOS containment regressions.
- All 7 focused status/motion tests pass. Lint is clean, the production build
  succeeds, both rendered-page checks pass, and `git diff --check` is clean.
- Browser QA against the real local bridge confirmed one labeled transcript
  log with live reading off, a stable atomic polite status node, completed-turn
  progressbar values, keyboard focus on the transcript, a visible 2-pixel inset
  focus ring, and no console warnings or errors.

### Remaining limitations

- Pure derivation and browser DOM checks do not emulate a specific screen
  reader's speech queue. The contract prevents known duplicate and hydration
  paths, but final announcement timing remains dependent on the user's browser
  and assistive technology.
- Reduced-motion routing is directly unit-tested; this release did not automate
  an operating-system accessibility preference inside the in-app browser.

## [v0.0.0.16] — 2026-07-30

### Conversation

Prompt: audit v0.0.0.15 for one highest-leverage reliability, recovery, or
evidence-provenance improvement at the boundary between prompt attachments,
disposable participant/broker workspaces, failed-turn retry, and local history.
Agents were asked to inspect the repository, challenge unsupported claims, use
optional sandboxed checks when useful, and avoid broader permissions or
credential exposure.

Across two rounds, Codex, Claude, and Antigravity converged on an attachment
identity and restoration invariant. The initial proposal added a content
manifest, but Claude showed that one-time materialization still lets a writable
participant copy mutate the prompt files seen by later turns and retries.
Codex then identified that naïve host-side rewriting could follow a
participant-created link, and Claude extended that analysis to hardlinks and to
project-owned files already under `.roundtable-attachments`.

Claude's bridge-brokered `npm run test:bridge` passed in its nested broker with
61 tests and 3 environment-dependent containment skips. Codex separately
reported 11 focused passing tests from its own sandbox. Those results were kept
distinct: the former was bridge-verified but nested, while the latter was
agent-reported and did not yet exercise attachment identity.

### Independent audit

- Accepted the manifest and per-invocation restoration proposal because the
  existing bridge materialized participant attachments only once and reused
  the same writable copy across later turns and failed-turn retries.
- Accepted destructive restore semantics only inside disposable copies and
  only when uploads exist. The bridge removes and privately recreates the whole
  attachment namespace before each CLI invocation, so stale files, symlinks,
  hardlinks, and project-owned residue cannot survive into the next invocation.
  The selected project is never changed.
- Accepted fail-closed digest, file-type, link-count, size, and path checks
  before a participant or broker process starts.
- Accepted binding the canonical manifest ID to bridge-brokered checks,
  checkpointed retry state, live snapshots, opted-in history, the locked room,
  and Markdown exports.
- Narrowed the durable record to one manifest ID. Per-file hashes remain
  internal because the aggregate identifier is sufficient provenance and
  avoids adding unnecessary file fingerprints to local history.
- Rejected both suggested `bridge-broker-stale` and post-cleanup retry modes.
  Failed-turn retry is awaited before cleanup, so the immutable payloads and
  saved broker transaction are still live. A real internal mismatch fails
  closed; a pre-execution infrastructure denial remains an explicit blocked
  check; and a valid saved result is reused without running the command again.
- Corrected v0.0.0.15's unconditional no-skip wording. Host containment probes
  pass without skips on an unnested host and self-skip where a parent sandbox
  prevents the required nested probe.

### Implementation

- Attachment normalization now computes SHA-256 for each in-memory payload and
  a deterministic manifest ID over ordered name, media type, generated path,
  size, and content digest fields.
- Every Codex, Claude, and Antigravity invocation—including broker follow-ups,
  failed-turn retries, synthesis, and dissent review—restores attachments from
  the immutable in-memory payloads first.
- Restoration removes only the disposable copy's attachment directory,
  recreates it with owner-only permissions, writes exclusive no-follow files,
  and verifies regular single-link files against the expected manifest.
  Sessions without uploads leave any copied project-owned namespace untouched.
- Fresh broker copies use the same materialization invariant. Executed broker
  evidence carries the manifest used for the command, and the checkpoint keeps
  that identity when a failed follow-up is retried without re-execution.
- Live and archived rooms retain only the canonical manifest ID and attachment
  metadata, never uploaded bytes or base64. The locked summary, evidence card,
  copy action, and Markdown export expose the applicable identifier.

### Verification

- All 70 bridge tests pass with no skips on the unnested host, including the
  Claude, Codex, Antigravity, broker-network, symlink, hardlink, mutation,
  retry, history-privacy, and credential-containment regressions.
- Focused attachment, broker-controller, history, and bridge-core checks pass.
- Lint is clean, the production build succeeds, and both rendered-page checks
  pass.
- Browser QA used the real file picker and bridge to create, lock, restore, and
  stop an attachment-bearing room. The shortened manifest remained readable
  in the desktop room summary without overflow, and the browser console
  reported no warnings or errors.

### Remaining limitations

- A content digest proves that two Roundtable records refer to the same bytes;
  it does not establish that the human-provided file was truthful or safe.
- A broker check blocked before its disposable workspace is prepared has no
  attachment-manifest claim. It remains visibly blocked rather than receiving
  provenance for an execution that never occurred.

## [v0.0.0.15] — 2026-07-30

### Request and audit

Request: let the discussion prompt upload files.

The implementation was scoped as a real agent input channel rather than a
decorative picker or an unsafe append-to-topic shortcut. Uploaded bytes must be
available to all three participants and optional brokered checks, while the
selected project, visible transcript, history records, and Completion Brief
remain free of opaque base64 payloads.

### Prompt attachments

- The discussion textarea now includes an accessible **Add files** control,
  attachment chips with names and sizes, individual remove actions, and a
  visible capacity counter.
- A prompt accepts up to five files, 1 MB per file and 3 MB combined. Duplicate
  names, oversized input, malformed base64, invalid media types, control
  characters, and excessive request bodies are rejected at both browser and
  bridge boundaries.
- The bridge replaces untrusted filenames with generated safe relative paths
  under `.roundtable-attachments/`.
- Attachment bytes are copied with private permissions into each participant's
  disposable workspace and into fresh broker workspaces when a participant
  requests a check. The original project is never modified.
- Every agent prompt lists the same attachment paths, names, media types, and
  sizes. It explicitly treats file contents as evidence rather than control
  instructions.
- Session snapshots, SSE events, local history, exports, and archived rooms
  retain attachment metadata only. Raw bytes stay in private in-memory payloads
  until cleanup and are then released.
- Locked and archived session summaries show the prompt files that informed the
  discussion, and Markdown export records their names and sizes.

### Verification

- Added normalization, traversal-resistant filename, media-type injection,
  duplicate, malformed input, size/count, materialization, prompt disclosure,
  snapshot privacy, and all-participant prompt regressions.
- On an unnested host, all 64 bridge tests pass with no skips, including host
  sandbox-containment probes. Environment-dependent probes self-skip when a
  parent sandbox prevents the required nested profile.
- Lint, the production build, and both rendered-page checks pass.
- Browser QA confirmed the upload control, limits, prompt hierarchy, keyboard
  labels, and desktop layout render correctly without displacing the primary
  discussion controls.

## [v0.0.0.14] — 2026-07-30

### Conversation and audit

Prompt: audit and test v0.0.0.13, ask what tools each participant genuinely
needs, and converge on the highest-leverage v0.0.0.14 improvement.

The first two-round discussion used a real Antigravity broker request and found
four correctness gaps: broker copies were cached across turns, six
agent-reported checks could evict bridge-verified provenance, an empty
post-result reply could resurrect a stale pre-check draft, and retrying a
failed follow-up could execute the same broker command again. Claude also
identified that broker commands inherited the host `HOME`/Codex environment,
which could turn tool-cache denials into misleading test failures.

After implementation, a separate one-round release audit exercised Claude's
new broker request path with `npm run test:bridge`. The bridge-owned result
passed with exit 0. Codex and Antigravity confirmed that all three participant
model routes now use one display structure and that the completed-state layout
no longer leaves a disabled steering composer over the transcript. Their hold
recommendation was accepted for direct checkpoint lifecycle coverage and
release metadata, while the proposal to keep steering visible during
synthesis was rejected: synthesis begins only after the final agent turn, when
there is no next turn to steer.

### Participant-neutral broker controller

- Claude and Antigravity can optionally request one approved argv command
  without gaining shell access in their model processes.
- Every request gets a new disposable project copy and a writable scratch
  `HOME`; participant CLI configuration and ambient credentials are omitted.
- The request copy is removed immediately in `finally`, so mutations cannot
  leak into later checks.
- The controller checkpoints the bounded result by participant and turn. A
  failed follow-up retries from that saved result without re-executing the
  command, and prompt drift rebuilds the follow-up from the same checkpoint.
- Empty or request-bearing follow-ups are rejected instead of publishing a
  draft that never saw the result.
- Known sandbox startup denials are classified as `blocked`, while ordinary
  nonzero test exits remain `failed`.
- Bridge-owned evidence is prepended before agent-reported evidence so the
  verified record cannot be truncated from the six visible checks.

### Finished-state UI and model routing

- The Completion Brief is absent during setup and every agent turn. After the
  final turn it appears once, in the transcript scroll, with pending synthesis
  or the completed outcome.
- The steering composer disappears when no future agent turn exists and is not
  rendered in archived rooms, eliminating the overlap and empty-column failure
  shown in the reported screenshot.
- Codex, Claude, and Antigravity now share the same friendly
  `Model · Effort` line plus exact `model: … · effort: …` disclosure.
- Encoded Antigravity effort suffixes are removed from the friendly model name,
  preventing `Gemini … · High · High`.

### Verification

- Added direct regressions for fresh request copies, scratch broker
  environment, denial classification, protected evidence precedence, empty
  follow-ups, second requests, prompt drift, and retry without re-execution.
- A host-level bridge run passes all 60 tests, including the Seatbelt and Codex
  command-sandbox containment probes with no skips.
- A live Claude broker handshake passed `npm run test:bridge` with verified
  bridge provenance.
- Browser QA confirmed zero Completion Brief instances during live turns, one
  transcript-contained brief after completion, zero finished-state steering
  composers, and identical model disclosures for all three participants.

## [v0.0.0.13] — 2026-07-29

### Conversation and audit

Prompt: explain why macOS blocks Antigravity's nested sandbox and safely
unblock it.

The first reproduction corrected an overbroad assumption: a trivial nested
`sandbox-exec` profile can start, but applying a second restrictive Seatbelt
policy from inside Roundtable's restrictive outer credential guard fails with
`sandbox_apply: Operation not permitted` and exit 71. Removing either layer
was rejected. Removing the outer guard would expose the real project, sibling
workspaces, and host configuration; removing Antigravity's native command
sandbox would let test subprocesses inherit the model client's network and
runtime access.

A live Codex audit accepted bridge-owned provenance but found two weaknesses in
the first broker draft: it reused Antigravity's own disposable copy, allowing a
test mutation to affect later inspection, and it approved executables by
basename even when supplied through an arbitrary path. Claude's turn then
stopped because its persisted OAuth token has been revoked, so the release gate
continued with direct Antigravity validation rather than hiding the unrelated
authentication failure.

### Broker-only Antigravity checks

- Antigravity can end a draft with one bounded
  `roundtable-test-request` JSON block containing an argv array. The bridge
  validates 1–16 arguments, rejects control characters and oversized input,
  accepts only exact executable names, and never invokes a shell.
- The bridge creates a fourth, fresh broker-only project copy on demand and
  launches the requested command from the unsandboxed bridge parent. This
  avoids nesting a restrictive command sandbox inside Antigravity's outer
  Seatbelt profile.
- The command runs under the installed Codex command-sandbox engine with
  workspace-only writes. Host home data, the original project, the three agent
  workspaces, and sibling broker roots are denied.
- Network policy allows only loopback targets so HTTP integration tests can
  start local servers. A live containment probe bound and connected to
  `127.0.0.1`, while a direct socket to `1.1.1.1` failed with `EPERM`.
  External and private-network destinations remain blocked.
- Test-created or modified files remain in the broker copy, which is deleted
  with the session. Antigravity's second invocation is denied that broker root
  and receives only bounded, redacted stdout/stderr plus the bridge-owned
  status and exit code.

### Honest evidence UI

- Broker results carry `provenance: "bridge-broker"` and render as
  **Verified by Roundtable broker**. Existing Codex evidence is explicitly
  tagged `agent-reported`; mixed evidence stays distinguishable in later
  prompts, history, completion input, and Markdown export.
- Antigravity cannot create broker provenance through its response. The bridge
  constructs the evidence record from the process it launched, strips a second
  request instead of executing it, and gives the agent one result-aware final
  response pass.
- The safety and test-capability panels now disclose the broker-only copy,
  shell-free argv execution, loopback-only network boundary, discarded test
  mutations, and Claude's still-read-only status.

### Verification

- Added request parsing, exact-executable rejection, output redaction,
  bridge-provenance, result-prompt, response-object, network-policy, protected
  path, workspace write, loopback allow, and external-network deny regressions.
- All 53 bridge tests pass on the host. The complete `npm run test:bridge`
  command also exits 0 inside a broker-only copy with 50 passes and three
  expected self-skips for tests that intentionally attempt another nested
  command sandbox.
- A real Antigravity handshake inspected the implementation, emitted
  `["npm","run","test:bridge"]`, received an exit-0 broker result, emitted no
  second request, and accurately summarized 53 tests, 50 passes, zero failures,
  and three environment-dependent skips.
- Lint, the production build, rendered-page checks, and the full release suite
  passed before tagging.

## [v0.0.0.12] — 2026-07-29

### Conversation

Prompt: let Codex, Claude, and Antigravity inspect v0.0.0.11 and decide the
single highest-leverage next focus across usefulness, reliability, safety,
accessibility, and maintainability.

Across two open rounds, all three chose the agent environment-credential
boundary over another feature or UI pass. The bridge cloned nearly all of its
terminal environment into every repository-influenced agent child and deleted
only its own bridge token. Filesystem guards could deny `~/.aws` while the same
child still inherited `AWS_SECRET_ACCESS_KEY`, an API token, database URL, or
package-registry credential. Claude then found that a shared minimal allowlist
could break custom CLI homes and that startup probes used the unsanitized host
environment, creating probe/turn drift. The room converged on role-scoped
filtering, persisted-login readiness, one resolved config-home source, and
actionable diagnostics without a larger health-state redesign.

Two real three-agent release gates refined the boundary further. The first
caught lexical-only protection for symlinked config homes, a nested
`CLAUDE_CONFIG_DIR` ancestor write lock, and unverified tilde paths in the
Codex permission table. The second showed that merely enumerating existing
siblings under a nested `~/.config/claude` still allowed creation of a new
sibling. Every blocker was accepted and repaired before release.

### Role-scoped process environments

- Agent children now receive an explicit common runtime baseline plus only the
  active role's approved config-home variable. Codex never sees Claude's config
  path, Claude never sees Codex's, and Antigravity receives neither.
- Filtering applies after inherited values and future overrides are merged, so
  an override cannot reintroduce a token or unrelated variable. `CI`,
  `NO_COLOR`, and `TERM` are then fixed by the bridge.
- API keys, OAuth/access tokens, cloud secrets, database URLs, registry
  credentials, bridge credentials, `NODE_OPTIONS`, and all other non-allowlisted
  values remain outside agent processes.
- Capability, model, persisted-login, and Antigravity model-list probes run
  under the exact same role-specific environment used for discussion turns.
  Codex and Claude use their non-mutating login-status commands; Antigravity's
  authenticated model listing remains its readiness check.

### Credential-home and policy verification

- Custom `CODEX_HOME` and `CLAUDE_CONFIG_DIR` values are normalized only when
  explicitly set, preserving default Claude keychain behavior. Every Codex,
  Claude, Antigravity, and Gemini credential root is protected from sibling
  agents through both its lexical alias and canonical `realpath` target.
- Codex filesystem denials now use absolute paths rather than unverified tilde
  expansion. Startup executes the installed Codex permission profile against
  the selected project boundary and fails closed if the denied read succeeds or
  the profile cannot run.
- A nested Claude home such as `~/.config/claude` denies writes across every
  intermediate ancestor with canonical-aware pathname rules, then allows only
  the bounded Claude runtime paths. Existing sibling applications and
  not-yet-created siblings remain blocked.
- Recognized withheld authentication variable names—not values—appear in the
  terminal and room. Missing persisted sign-in prevents session creation with
  the relevant login command, and recognized turn-time authentication failures
  receive the same safe remediation.

### Verification

- Added role and override isolation, representative secret withholding,
  probe/turn parity, persisted-login diagnostics, lexical/canonical alias,
  nested-config ancestor, existing/new sibling, absolute Codex permission, and
  rendered disclosure regressions.
- Ran 47 bridge, archive, environment, invocation, history, copy, sandbox,
  redaction, authentication, and policy tests successfully. The executable
  macOS tests proved a nested Claude cache remains writable while an existing
  `~/.config/gh` sibling and a nonexistent sibling are denied. Lint, a
  production build, two rendered-page checks, and diff validation also passed.
- Started the real bridge with fake API-key, database, registry, and injection
  variables present. Health named only the recognized withheld authentication
  variables, all three persisted-login checks passed, the installed Codex guard
  probe passed, and six council turns plus two three-agent gates completed
  without ambient credentials.

## [v0.0.0.11] — 2026-07-29

### Conversation

Prompt: have Codex, Claude, and Antigravity inspect Roundtable and debate how
they would improve its UI/UX, then audit the recommendations, implement the
highest-value subset, test it, and release it.

Across two rounds, the three agents converged on a state-driven room rather
than one permanently dense dashboard. Setup should emphasize connection, goal,
and participant configuration; a live session should make the transcript
primary while retaining exact locked routing; and a restored archive should
look and behave read-only. They also agreed on a central new-discussion reset,
mobile participant access, visible keyboard focus, and conditional transcript
auto-scroll.

Claude challenged a broader three-page redesign and unverified claims about
Antigravity option precedence. The release audit kept Outcome inside the room,
deferred a modal/dialog overhaul until the app has an interaction primitive,
and avoided describing undocumented CLI precedence. The council's first run
then supplied stronger evidence: `gemini-3.6-flash-high` paired with `medium`
effort was rejected by the installed CLI. That observed failure became a
focused routing repair at both UI and bridge boundaries.

### Room lifecycle and hierarchy

- The workspace now derives an explicit `setup`, `session`, or `archive` mode
  from existing room state. Setup uses a two-column configuration/preview
  layout; live and archived rooms replace the long form with a compact locked
  session summary and prioritize the transcript.
- A single `resetToSetup` path closes the stream, forgets recovery state, clears
  transcript-specific state, restores current bridge defaults, and powers every
  New discussion action. The history drawer disables that action while a live
  room is busy so it cannot silently abandon running work.
- Archived failures use read-only language and omit retry deadlines. Archive
  state cannot steer, retry, or stop agent work, while post-completion dissent
  judgments remain intentionally available.
- Transcript auto-scroll now follows new turns only while the reader is near
  the bottom. Scrolling up preserves the reading position until the reader
  returns to the live edge.

### Model clarity and accessibility

- Antigravity displays both its friendly name and the exact `model · effort`
  route in session and context summaries.
- When an Antigravity model identifier encodes `low`, `medium`, or `high`, the
  UI synchronizes and locks the effort slider. Session creation and the final
  CLI invocation independently reject contradictory values.
- Bridge startup derives Antigravity's default effort from its discovered model
  when no environment override is supplied. This fixes the invalid default that
  interrupted the first council run.
- Participant model and effort controls remain reachable on narrow screens
  instead of disappearing. All buttons, inputs, textareas, selects, summaries,
  and links receive a consistent visible `:focus-visible` outline.

### Verification

- Added invocation and bridge regressions for encoded Antigravity effort,
  contradictory route rejection, state-driven rendered markup, central reset,
  proximity-gated scrolling, mobile participant visibility, and focus styling.
- Ran 38 bridge, archive, environment, invocation, prompt-file lifecycle, copy,
  sandbox, redaction, and routing tests successfully, followed by lint, a
  production build, and two rendered-page contract checks.
- Started the real bridge against this repository. Health reported
  `gemini-3.6-flash-high · high`; an authenticated contradictory session request
  returned HTTP 400 before creating a session, confirming the live guard.

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
