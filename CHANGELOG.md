# Changelog

Every Roundtable release represents one complete iteration: a visible agent
discussion, the implementation selected from that discussion, and verification
of the resulting app. Versions advance in `v0.0.0.1` increments.

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
