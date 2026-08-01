# Roundtable

Roundtable gives Codex CLI, Claude CLI, and Antigravity CLI one visible,
steerable project discussion.

Current release: **v0.0.0.38**

Roundtable uses four-part development versions. Each completed agent
conversation plus its implemented improvement increments the final field:
`v0.0.0.1`, `v0.0.0.2`, and so on. See [CHANGELOG.md](CHANGELOG.md) for the
discussion outcome and implementation details behind every release.

## Start it

All three CLIs must already be installed and signed in. The Antigravity command
is `agy`. From this folder:

```bash
npm run talk
```

The command starts the local bridge and web room as one supervised launch. It
prints and opens the connected room only after the web server is ready and the
new bridge answers an authenticated health check. A port conflict, startup
timeout, spawn failure, or unexpected child exit stops both process trees and
reports the failing stage instead of leaving a partial room running. Press
`Control-C` in the terminal to stop both. The personal plugin selects available
local bridge and web ports for every launch, so a completed room that is still
open cannot block a new meeting. Direct launcher users may set
`ROUNDTABLE_BRIDGE_PORT` and `ROUNDTABLE_WEB_PORT` explicitly. Startup waits up
to three minutes by default so a healthy first compile is not mistaken for a
dead launch; set `ROUNDTABLE_STARTUP_TIMEOUT_MS` from 1000 through 900000 to
override that deadline.

The web dev server binds the selected port strictly. Startup supervision tracks
bridge readiness, web readiness, and child-process state separately, so a
living web child that never binds its port is reported as such instead of being
confused with a dead process or an unhealthy bridge. That exact state now
explains that a synced or cloud-backed checkout can stall the compiler before
port binding and recommends a local checkout. Failure still uses bounded
whole-process-tree cleanup.

Launcher shutdown is also a workspace lifecycle boundary. SIGINT/SIGTERM asks
the bridge to stop active participants, remove every prepared source and role
sandbox, and close its streams before forced process escalation. Cleanup waits
for in-flight source materialization and role cloning. Every disposable root is
session-owned synchronously after `mkdtemp`, before canonicalization. Every
source, role clone, and request-scoped broker copy remains an owned operation
until it settles. Cleanup therefore does not return while a writer can still
touch disk, and it prevents any new root once teardown starts. Immediately before
the bridge's emergency force-exit, a synchronous final sweep removes every
registered root. Root removal is retrying and fault-isolated, and shutdown runs
a fresh sweep after participant termination so a live writer cannot permanently
poison a memoized pre-escalation cleanup. Partial
copies from preparation errors use the same cleanup path; a later startup still
sweeps abandoned day-old sandboxes as crash recovery.

## Use it from another Codex project

The personal **Roundtable** plugin on this workstation can launch the room from
any Codex project. Start a new task in the target project, then select
`@Roundtable` from the desktop plugin picker or explicitly invoke the bundled
skill:

```text
Use $roundtable for this project.
```

The natural-language form `use @roundtable for this project` is also an
implicit trigger after the plugin is installed. Codex resolves the current Git
root (or current working folder), opens Roundtable with that project and the
discussion goal prefilled, and starts the discussion immediately. Invoking the
plugin is the authorization boundary: the room uses the three CLIs' configured
model and effort defaults, the requested round count, no attachments, no dissent
check, and no local transcript retention. Newly installed or updated plugins are
picked up in a new Codex task.

The launcher itself supports the same behavior without the plugin:

```bash
node "/path/to/roundtable/scripts/talk.mjs" \
  --project "$PWD" \
  --topic "Review this project's architecture and highest-leverage risks." \
  --rounds 2 \
  --start
```

Relative `--project` values resolve from the caller's working directory.
`--rounds` accepts one through five. `--start` begins the discussion as soon as
the bridge and room are ready; omit it to review the setup screen first. Set
`ROUNDTABLE_HOME` if the personal
plugin should use a Roundtable checkout in a different location.

Roundtable uses each CLI's persisted interactive sign-in. Ambient API keys,
access tokens, database URLs, registry credentials, and unrelated terminal
settings are not passed to agent processes. At startup, the bridge checks the
installed capabilities, persisted Codex and Claude login state, Antigravity
model access, and the executable Codex permission profile before accepting a
discussion. Every startup command probe has a 15-second deadline and a 64 KiB
combined-output limit. A stalled or noisy probe is terminated, its captured
output is discarded, and the affected CLI fails closed with a fixed labeled
diagnostic; ordinary nonzero authentication results retain their existing login
guidance. Those status probes verify local persisted state, not continued
provider acceptance. If a live turn rejects a revoked or expired OAuth token,
Roundtable overrides the optimistic startup result with exact re-login guidance
and explains the distinction. The launcher keeps its separate three-minute
aggregate deadline (or the bounded `ROUNDTABLE_STARTUP_TIMEOUT_MS` override) and
whole-process-tree cleanup.

## How a discussion works

1. Choose an absolute project folder and a discussion goal.
2. Optionally attach up to five prompt files (1 MB each, 3 MB combined).
   Roundtable copies them into every disposable agent workspace and lists their
   generated relative paths in the control prompt. File bytes never enter the
   visible transcript or local history. A canonical content manifest identifies
   the attachment set without retaining the uploaded bytes.
3. Review or change the model shown under each CLI participant. Friendly names such as Claude Opus 5 appear above the exact CLI identifier.
4. Set each agent's reasoning effort with the slider, from low through extra high to max. The bridge starts from each CLI's configured effort.
   Antigravity models whose exact identifier ends in `-low`, `-medium`, or
   `-high` lock the slider to that required level so the room cannot start an
   invalid CLI route.
5. Round one is a **sealed opening**: Codex, Claude, and Antigravity inspect
   separate disposable copies of one validated session-start source against one immutable input,
   without seeing peer answers. Later rounds reveal the labeled openings for
   cross-examination in a deterministic reader-specific order. Every message
   records its model, reasoning effort, phase, input hash, and context coverage.
6. Codex may optionally run focused existing checks in its native sandbox.
   Claude and Antigravity may each request one approved argv command;
   Roundtable executes it without a shell in a fresh request-scoped project
   copy, then returns the real result for that participant's final contribution.
7. Add a steering note at any time. During the sealed opening it waits until
   cross-examination so it cannot leak one participant's timing into another's
   independent input; otherwise it is added before the next agent turn. While
   waiting, the room and Markdown export label it as queued. Its arrival in the
   shared transcript removes the queued copy; only notes stranded by an ended
   or archived room are labeled never delivered.
8. If an agent call fails, Roundtable pauses that exact turn without changing the
   transcript. Retry the same agent and context, or end the discussion cleanly.
9. Only after the final agent turn, Roundtable asks Codex for a structured
   Completion Brief and falls back to Claude, then Antigravity, if a participant
   fails or returns invalid structure. The two non-synthesizing participants
   independently audit the draft against labeled transcript evidence. Material
   concerns permit exactly one fallback-capable revision; the room preserves
   the original draft, audits, attempts, and final brief. The persisted audit
   state closes as complete or stopped rather than retaining a stale running
   marker after the room ends.
10. Optionally enable **Dissent check**. After the audited brief is frozen,
    each agent gets one separate review pass and can identify labeled positions
    the brief missed or flattened. Mark each item **Represented** or **Missed**;
    those judgments are saved locally.
11. If you opt in, open **History** to revisit recent discussions after a bridge
    restart. Archived discussions are read-only and keep undelivered steering
    notes visibly separate from the transcript.
12. Stop the discussion whenever you want.

Ordinary turn context has a strict 48,000-character ceiling. Roundtable keeps
the newest useful context, shortens an individually oversized newest message,
and records included, shortened, and omitted labels on the resulting message.
The room and Markdown export surface partial input instead of silently implying
complete coverage. Completion synthesis separately preserves coverage across
every labeled message within its larger budget.

Role workspaces deliberately retain their session-start source and Git context.
Brokered checks deliberately use a fresh request-scoped copy of the current host
project. If the host project changes during a meeting, an agent can therefore
retain an older review diff while a later broker check sees newer host files;
v0.0.0.31 surfaces preparation truthfully but does not claim to detect or
refresh that staleness automatically.

Agent messages and repository-derived text enter later prompts only inside
escaped, explicitly untrusted data boundaries. The control prompt says that
peer content cannot issue commands, change roles, or request secrets; human
messages labeled **You** remain the only transcript-authored steering source.
Live agent bodies also pass through credential redaction and disposable-path
scrubbing before they enter snapshots or another participant's prompt. These
controls reduce instruction propagation but do not claim that lexical
sanitization alone eliminates prompt injection.

The workspace changes with the room lifecycle. Setup keeps the goal,
connection, and participant controls beside a conversation preview. Once a
discussion starts, those controls collapse into a session summary so the live
transcript becomes primary. The project, topic, model, effort, attachment,
history, and dissent settings remain locked, while **Add rounds** can extend a
live meeting by one through five rounds without forking the room or losing its
transcript. A room can contain up to twenty rounds. Opening local history
creates a visibly read-only archive state, and **New discussion** returns every
room surface through one reset path.

Active discussions survive a refresh in the same browser tab while the bridge
remains running. If the live event stream drops, the room retains its session,
rebuilds from a fresh bridge snapshot, and retries transient snapshot or ticket
failures with capped backoff. Switching rooms, starting a replacement session,
or resetting the setup invalidates older recovery work so a delayed response
cannot resurrect or mutate the prior room. An expired bridge key asks for a new
connection without discarding the saved session pointer needed for history
recovery. Completed transcripts can be copied or exported as Markdown from the
room header.

The live room exposes concise, polite turn-status announcements without reading
whole agent replies aloud. Its transcript is a labeled keyboard-focusable log
with a visible inset focus ring, progress reports completed turns through native
progressbar semantics, and automatic transcript scrolling becomes instant when
the operating system requests reduced motion. While an agent is working, the
room reports whether its isolated workspace is still being prepared, its CLI
process is alive, or the request remains active. For a live process it shows
elapsed reasoning time and, after twenty quiet seconds, time since the last
stdout or stderr activity. Quiet reasoning is therefore not presented as a
failure; an actual exit, timeout, or agent error continues through the existing
terminal or retry flow. Liveness is ephemeral runtime state, restored on a live
reconnect but excluded from archived discussion history. Opening an archive
does not replay its transcript through the live announcement channel.

## Measuring decision quality and workflow value

Roundtable is not primarily a way to produce an answer faster. Its central
hypothesis is that independent perspectives, visible disagreement,
cross-examination, evidence-based consolidation, and adversarial audit produce
decisions and product changes that are more **rounded** and more difficult to
break.

In measurable terms, rounded means:

- **accurate:** the result is factually and technically correct;
- **complete:** important requirements, risks, alternatives, and edge cases are
  covered;
- **procedurally objective:** conclusions survive independent viewpoints and
  are tied to evidence rather than one model's confidence;
- **robust:** the result survives hidden tests, adversarial review, and unusual
  scenarios;
- **traceable:** consequential claims and decisions can be connected to code,
  tests, or labeled discussion evidence;
- **honest about uncertainty:** unresolved dissent and weak evidence remain
  visible instead of being flattened into false consensus.

Multiple models can share training biases and make the same mistake, so
Roundtable does not guarantee truth or literal objectivity. Its claim is
procedural: sealed openings reduce anchoring, cross-examination makes
disagreement useful, and audited synthesis makes unsupported consensus harder
to pass through unnoticed.

v0.0.0.26 defines how to test that hypothesis; it does **not** claim a measured
quality or productivity lift yet. The unit of value is a robust accepted product
change, not a discussion, message, token, commit, or line of code.

### What existing productivity research warns us

Published results differ sharply by task and setting:

| Study | Setting and result | Design lesson for Roundtable |
| --- | --- | --- |
| [Peng et al. (2023)](https://www.microsoft.com/en-us/research/publication/the-impact-of-ai-on-developer-productivity-evidence-from-github-copilot/) | In a controlled JavaScript HTTP-server task, developers with GitHub Copilot completed the task 55.8% faster. | Bounded implementation tasks can show large gains, but do not represent mature product work by themselves. |
| [Cui et al. (2025)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4945566) | Three randomized field experiments at Microsoft, Accenture, and a Fortune 100 company covered 4,867 developers. Pooled access to a coding assistant increased completed tasks by 26.08% (standard error 10.3%), with noisy and varying individual experiments. | Use real work and enough repeated tasks; report uncertainty and differences by task and developer experience. |
| [Becker et al. (2025)](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/) | Sixteen experienced developers completed 246 randomized issues in their own mature repositories. Allowing early-2025 AI tools increased completion time by 19%, even though participants believed the tools made them faster. | Do not use satisfaction or estimated time saved as the efficiency result. Measure actual time and accepted output. |
| [METR design update (2026)](https://metr.org/blog/2026-02-24-uplift-update/) | A follow-up produced raw estimates consistent with roughly 4–18% speedup, but the authors judged the signal unreliable because participation selection changed and parallel-agent use made time tracking difficult. | Measure the complete orchestrated workflow and publish unusable or biased data as such. |
| [Demirer, Musolff, and Yang (2026)](https://www.nber.org/papers/w35275) | A matched event study of more than 100,000 GitHub developers associated autonomous agents with 180% more commits, but only 30% more releases and no increase in app usage. | Count merge-ready, released, and used improvements. Activity is a diagnostic, not the product outcome. |

[SWE-bench](https://arxiv.org/abs/2310.06770) demonstrates a useful task
shape—2,294 issue-and-pull-request problems from 12 repositories with executable
evaluation—but benchmark pass rate alone does not measure orchestration,
consolidation, end-to-end delivery, or downstream product value.

Together, these studies rule out a credible universal speed multiplier and show
why activity, self-reported helpfulness, and benchmark success are insufficient.
Roundtable must be tested on decision quality and delivered product quality as
the system the user actually operates:

```text
single-model baseline: human ↔ one coding model
Roundtable treatment:  human ↔ Codex butler ↔ multiple deliberating models
                                              ↓
                                  consolidated judgment
                                              ↓
                                  Codex-managed delivery
```

The question is whether Codex, acting as the user's butler and consolidator,
can use the multi-model discussion to deliver more accurate, complete, robust,
and evidence-grounded product changes than the same human working with one
model. It is not a comparison of isolated model answers, and it is not primarily
a race against human active hours.

### Controlled comparison

Use three primary arms:

| Arm | Workflow |
| --- | --- |
| Human + Codex | The user works with Codex alone to decide, implement, test, repair, and prepare the change. |
| Human + Claude | The user works with Claude Code alone through the same delivery boundary. |
| Human + Codex butler + Roundtable | The user delegates to Codex; Codex launches and steers the multi-model room, consolidates its audited Completion Brief, then manages implementation, tests, repair, and delivery. |

An optional fourth **parallel answers + Codex** ablation gives Codex the same
models and approximate invocation allowance but removes sealed opening,
cross-examination, and audited synthesis. It separates the value of Roundtable's
deliberation design from the value of simply buying more model attempts.

For each task:

1. Freeze one base commit, task statement, permission profile, tool set,
   acceptance rubric, and hidden test suite.
2. Randomize arm order and use fresh worktrees or clones. Never let one arm see
   another arm's output.
3. Keep the same human owner and delivery boundary. Match Codex model, effort,
   permissions, and repair ceiling between the Codex baseline and Roundtable
   arm. Roundtable's additional participants, deliberation, and consolidation
   remain part of its treatment.
4. Run two complementary protocols:
   - **Fixed delivery window:** stop every arm at the same elapsed-time or
     attempt ceiling, then compare accepted product quality.
   - **Fixed quality:** allow repair until the same acceptance gate is reached
     or a ceiling is hit, then compare end-to-end cycle time and rework.
5. Have reviewers who do not know the arm judge requirement coverage,
   maintainability, and regression risk. Run hidden tests outside the agent
   workspace.
6. Keep aborted, failed, and timed-out runs in the result set. Record
   crossovers, manual rescue, quota exhaustion, and unavailable participants
   instead of silently dropping them.

A practical pilot is 12–20 real backlog tasks across four strata: localized
bugs, cross-cutting changes, security or reliability work, and ambiguous
product or UX decisions. Three primary arms with two runs per task produce
72–120 runs; adding the ablation produces 96–160. That is enough to expose
instrumentation problems and estimate variance, but it is a pilot—not a
guaranteed statistically powered conclusion.

### Primary outcome: robust accepted changes

A **robust accepted change** must:

1. satisfy every predeclared must-have requirement;
2. pass hidden functional and regression tests;
3. clear a blinded correctness, completeness, maintainability, and
   regression-risk review;
4. survive a separate adversarial review written to find counterexamples,
   omitted cases, and unsupported assumptions;
5. require no undisclosed manual rescue.

The primary headline is therefore quality and resilience, not speed:

```text
robust outcome rate = robust accepted changes / all attempted changes

robustness lift (%) =
  100 × (Roundtable robust outcome rate / single-model robust outcome rate - 1)
```

Always report the absolute percentage-point difference as well. If the
single-model rate is zero, the ratio is undefined and only the absolute
difference and confidence interval are reported.

The blinded scoring rubric should keep its dimensions separate:

- **accuracy:** correctness of claims, decisions, and implementation;
- **coverage:** satisfied requirements, addressed risks, and handled edge
  cases;
- **procedural objectivity:** evidence use, consideration of alternatives, and
  resistance to unsupported confidence;
- **robustness:** hidden-test, adversarial-review, and regression performance;
- **traceability:** consequential claims connected to inspectable evidence;
- **calibration:** uncertainty and unresolved dissent represented honestly.

Do not hide these dimensions inside one unexplained score. A weighted aggregate
may be published only when its weights were declared before the experiment and
the complete scorecard appears beside it.

### Consolidation gain

Roundtable should also prove that consolidation adds value beyond merely
sampling more models. A blinded evaluator scores every sealed opening, an
optional equal-call parallel-answer baseline, the first Completion Brief, and
the final audited brief with the same rubric:

```text
best-input gain = final audited score - best individual opening score
audit gain = final audited score - first Completion Brief score
```

These measurements reveal whether cross-examination and audit actually improve
the strongest available input, merely choose it, or make it worse. For product
delivery, compare the resulting implementation with the best single-model
implementation under the same hidden acceptance gate.

### Secondary constraints

Time, subscription cost, and human intervention still matter: a more robust
workflow must remain usable. They are reported as constraints and tradeoffs,
not treated as the definition of value.

Also report:

- first-pass and final acceptance rate;
- hidden-test pass rate and blinded review score;
- adversarial challenges found, resolved, and left unresolved;
- requirement and risk coverage;
- time to first valid patch and time to merge-ready;
- total elapsed minutes, user interventions, steering actions, and repair loops;
- participant calls, failures, fallbacks, and subscription quota exhaustion;
- manual edits after the agent stops;
- critical regressions, rollbacks, and escaped defects;
- release and product-impact outcomes when observable.

Roundtable uses signed-in CLI subscriptions, so its model cash cost is not
reconstructed from tokens or API list prices. Within included usage, the
marginal per-call fee is zero; the relevant cash inputs are the actual recurring
subscription fees and any real overage or add-on charges. Compare both:

```text
let C = actual Codex subscription fee allocated to the evaluation period
let L = actual Claude subscription fee allocated to the evaluation period
let A = actual Antigravity subscription fee allocated to the evaluation period

Human + Codex fixed model fee       = C
Human + Claude fixed model fee      = L
Codex-butler + Roundtable fixed fee = C + L + A

incremental Roundtable fee vs Codex  = L + A
incremental Roundtable fee vs Claude = C + A

subscription cost per accepted change =
  applicable fixed model fee / accepted changes
```

Use the invoiced amount for each variable, including `0` for a free or bundled
participant. If all subscriptions were already paid for independently, report
both the full allocated stack and an incremental cash fee of zero rather than
inventing a token cost. Still report the evaluation window, included quotas,
throttling, and utilization so the result can be reproduced. Report the Codex
and Claude single-model comparisons independently. For every metric, show the
paired task delta, median, win/tie/loss count, and a task-clustered bootstrap
95% confidence interval. Stratify by task type and complexity; do not average a
small bug fix and an architectural decision into an unexplained headline.

### Roundtable-specific diagnostics

These explain *why* the workflow won or lost but are not substitutes for the
primary outcome:

- **opening divergence:** materially different proposals in the sealed round;
- **cross-examination correction:** claims retracted or corrected after peer
  evidence;
- **best-input gain:** improvement over the strongest sealed opening;
- **audit yield and precision:** supported concerns found, and the share later
  judged material;
- **revision lift:** blinded quality change from draft to audited final brief;
- **calibration:** confidence appropriate to the available evidence and
  unresolved dissent;
- **fallback rate:** synthesis or participant failures requiring recovery;
- **context loss:** shortened or omitted labeled inputs;
- **deliberation waste:** no divergence, no material audit finding, and no
  consequential revision.

v0.0.0.26 already records message and event timestamps, model and effort,
sealed-opening input hashes, context coverage, synthesis attempts, audits,
revision provenance, and sanitized Git-change evidence. Those fields support
the diagnostics and an audit trail. A causal efficiency comparison still needs
an experiment record linking the discussion to its implementation commit,
arm and delivery ceiling, butler interventions, participant availability and
quota failures, actual subscription allocation, hidden acceptance result,
dimension-level blinded scores, adversarial-review result, best-input and audit
gain, and downstream release outcome. Until those records exist and the
controlled runs are completed, the honest Roundtable quality and robustness
result is **not yet measured**.

## Local discussion history

Roundtable asks before archiving anything. If you choose **Keep locally**, new
discussions are saved as append-only event logs in the operating system's user
data folder, outside the discussed project. The archive:

- uses owner-only directory and file permissions;
- never stores bridge credentials or SSE tickets in structural event fields;
- lists only topic, project name, date, status, and message count until you open a
  record;
- retains attachment metadata and one canonical manifest ID, never uploaded
  bytes or base64 payloads;
- retains at most 50 discussions for 30 days;
- recovers the valid prefix of a log if its final write was interrupted;
- marks nonterminal discussions as interrupted after a bridge restart;
- refuses record deletion or clearing while a targeted saved discussion is
  active or still draining its final history writes, then permits deletion
  after that write chain closes;
- prevents later writes from recreating an unindexed transcript after deletion
  and drops stale index rows whose transcript bytes are already missing without
  deleting potentially recoverable unindexed logs;
- can be turned off for future discussions, deleted record by record, or cleared
  from the History drawer. Browser deletion uses authenticated DELETE preflight
  and reports the bridge's specific conflict message when a live discussion
  must end first.

Set `ROUNDTABLE_HISTORY=off` before `npm run talk` to disable archive storage and
its API entirely. `ROUNDTABLE_HISTORY_DIR` can override the user-data location.

## Optional dissent check

The dissent check is a deliberately small measurement experiment, not an
automatic claim about consensus. It requires local history and adds one
post-brief review pass per agent after the automatic two-review draft audit and
optional one-revision cycle. The completion brief is synthesized from the
normal transcript only and frozen before dissent review starts.

Every transcript message has a stable session-order label such as `[M4]`.
Reviewers receive a coverage-preserving excerpt for every label and may return
bounded, attributed summaries that reference those labels. The room calls these
agent-stated summaries, not quotes or verified findings. A completed review with
an empty item list appears as **No concerns reported**; a malformed or failed
review appears separately as unavailable and does not block the other agent or
discard the brief.

Each concern receives a bridge-owned `D#` ID and appears beside the brief with
**Represented** and **Missed** controls. Judgments are appended only after the
review item is durably stored, survive bridge restarts, and can be changed
later. If local history becomes incomplete, judgment controls fail closed and
the warning remains visible in the archive. Copy and Markdown export include
review coverage, summaries, reasons, and current judgments.

## Failed-turn recovery

Temporary provider, timeout, empty-response, and model errors pause the affected
turn instead of terminating the room. The failure card shows the agent, sanitized
error, attempt count, and retry deadline. Retry:

- uses the same agent, model, reasoning level, turn number, immutable input hash,
  and exact frozen prompt;
- never duplicates completed messages;
- checkpoints each sealed participant independently, so a later failure cannot
  rerun or reveal successful peer openings;
- keeps steering disabled so the retry input cannot silently change;
- accepts only one competing retry or end command;
- remains available after a same-tab refresh while the original bridge is alive.

An unresolved pause expires after 15 minutes and becomes a terminal error so it
cannot retain bridge capacity indefinitely. A bridge restart turns an unfinished
failed turn into a read-only interrupted archive; it does not automatically rerun
an agent.

## Optional test sandboxes

Roundtable creates three temporary agent project copies before the first turn so
every sandbox can deny both sibling roots from the start. Codex receives
workspace-write access only inside its native CLI sandbox. Antigravity runs in
plan mode with its native terminal sandbox inside a separate outer macOS guard.
Claude always uses plan mode with only Read, Glob, and Grep; it never receives
Bash. The native profiles and outer guards protect the real project, isolate the
agents' workspaces, and read-deny common host credential paths.
Each CLI remains operational with the runtime/auth access it requires. Claude
writes only to a bounded set of runtime entries while settings and other
existing `.claude` state remain write-denied. Antigravity retains only its
`.antigravity` and `.gemini` runtime write roots, and each agent is denied the
other CLIs' auth/config paths. Bridge credentials are removed from all agent
environments before any CLI starts. Agent environments are built from
role-specific allowlists: common runtime necessities plus only the active
CLI's explicit configuration-home override. Inherited and per-call values are
filtered by the same policy, and bridge-controlled noninteractive settings are
applied afterward. Home entries are refreshed for every
guarded turn rather than being frozen at bridge startup. The copies omit
repository metadata and generated build directories, reuse installed
dependencies when present, preserve safe relative symlinks inside the copy, and
reject absolute, dangling, external, or relocation-unsafe symlinks. Every copied
link is checked again before an agent starts, and Codex's native profile also
denies the original project path as defense in depth. The copies are deleted
when the discussion ends. Preparation responds to Stop and has a two-minute
limit. Roots left by a crashed bridge use a dedicated prefix and are removed
after they become stale without touching live or reply-output directories.
Links into intentionally omitted generated trees also fail closed rather than
silently changing meaning in the copy.

For Git projects, each disposable copy also receives a generated
`.roundtable-context` directory. It contains the detected branch/base metadata,
recent log and status text, a patch combining committed branch changes with
tracked working-tree changes, and `head-changes.patch`, which isolates the exact
committed `HEAD^..HEAD` change with its parent recorded in metadata. Agents are
told to inspect this evidence before reviewing a PR or release. The private host
`.git`, Git configuration, refs, hooks, credentials, and remotes are never
copied. Instead, Git projects receive a new local-only repository with a
synthetic baseline-path commit and a session-start snapshot commit. A local
`origin/main` ref names only that path baseline; no remote is configured and no
original commit identity or historical file content crosses the boundary. Tiny
synthetic marker blobs preserve added, modified, deleted, and exact rename-pair
evidence. This
lets repository-aware checks use `git ls-files`, status, local diffs, and baseline
file inventories without treating the synthetic history as original evidence.
The synthetic index suppresses worktree content comparisons;
`.roundtable-context` owns original content diffs. If Git context or the
synthetic snapshot cannot be produced, sandbox creation continues with the
copied source.

When a discussion has prompt files, Roundtable restores the entire private
attachment namespace from immutable in-memory payloads before every participant
invocation. The restore removes stale workspace mutations and links, writes
owner-only no-follow files, and verifies their content manifest before starting
the CLI. This happens only in disposable copies; the selected project is never
changed, and sessions without uploads leave a copied project-owned
`.roundtable-attachments` directory alone.

Configured CLI homes are resolved once and protected from the other two agents
through both their lexical paths and canonical symlink targets. A Claude config
home nested beneath a shared ancestor such as `~/.config/claude` receives a
bounded exception only for Claude's known runtime paths; existing siblings and
paths that do not exist yet remain write-denied. The room shows the names—not
the values—of recognized authentication variables withheld at the process
boundary. If persisted sign-in is missing or a turn returns a recognizable
authentication error, Roundtable gives the exact CLI login command to run.

Testing remains optional. Codex can run focused checks and report them from its
native sandbox. Claude remains on Read, Glob, and Grep, while Antigravity's
model process may inspect files but is told not to invoke terminal tools: a
restrictive native command sandbox cannot be applied inside Roundtable's
already restrictive outer macOS credential guard. Either read-only participant
can instead return one bounded `roundtable-test-request` containing an argv
array. The bridge accepts only exact approved executable names, never uses a
shell, and runs the command in a newly copied request-scoped workspace with a
scratch `HOME` and no participant CLI configuration.
That command can bind and connect to loopback for local test servers, but
external and private-network destinations, the host home, the original project,
and every agent workspace remain denied. Test mutations disappear with the
broker copy and cannot influence the participant's follow-up inspection. A
checkpointed controller retains the bounded broker result for the current turn,
so retrying a failed follow-up does not execute the command again. Antigravity's
full growing prompt is delivered through a one-use file in its own disposable
workspace instead of a command-line argument.

The v0.0.0.7 audit showed that wrapping Claude and Bash in one outer macOS
profile cannot isolate shell execution from Claude's required network and
runtime access. macOS also rejects a second restrictive Seatbelt policy from
inside that already restricted client. Roundtable therefore fails closed
instead of treating a command allowlist or disclosure as containment.
v0.0.0.13 applied the separate broker architecture to Antigravity. v0.0.0.14
extracts a participant-neutral checkpointed controller and gives Claude the
same separately tracked, bridge-owned request path without adding Bash or
changing Claude's read-only model process.

## Check evidence

When an agent runs a check, it may end its reply with a bounded, versioned
`roundtable-checks` JSON block. Roundtable validates and removes that transport
block, then shows an expandable disclosure such as **Reported by Codex · 1
passed**. Results use explicit `passed`, `failed`, and `blocked` states and show
the command, concise summary, producing round, and optional exit code.

That label is deliberate: the bridge receives an agent's final report but does
not independently observe its shell commands. Agent-reported evidence is never
described as verified, and a disagreement between prose and structured status
remains visible.

Claude and Antigravity broker results use a separate **Verified by Roundtable broker**
label. The bridge owns the process, exit code, status, and provenance record;
the participant receives bounded, secret-redacted output only after execution and
cannot mint broker provenance in its prose. Brokered and agent-reported
evidence remain distinct in later prompts, completion synthesis, history,
copy, and Markdown export. Malformed transport blocks stay ordinary reply text.
Commands and summaries are length-bounded and temporary roots appear as
`$SANDBOX`.

When a broker command actually runs with prompt files, its evidence also records
the canonical attachment manifest used in that fresh broker copy. A failed
follow-up reuses the saved result and manifest without running the command
again. A check blocked before workspace preparation makes no attachment-manifest
claim.

The bridge binds only to `127.0.0.1` and requires a fresh random key on every run.

Steering notes are held until a turn boundary so the transcript remains chronological. Stopping or timing out a discussion terminates the full CLI process group and escalates when a child ignores the initial signal.
