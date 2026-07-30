# Roundtable

Roundtable gives Codex CLI, Claude CLI, and Antigravity CLI one visible,
steerable project discussion.

Current release: **v0.0.0.17**

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

The command starts the local bridge and the web room, then opens the connected room in your browser. Press `Control-C` in the terminal to stop both.

Roundtable uses each CLI's persisted interactive sign-in. Ambient API keys,
access tokens, database URLs, registry credentials, and unrelated terminal
settings are not passed to agent processes. At startup, the bridge checks the
installed capabilities, persisted Codex and Claude login state, Antigravity
model access, and the executable Codex permission profile before accepting a
discussion.

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
5. Codex, Claude, and Antigravity take turns in that order from separate
   disposable copies of the same project and read the same shared transcript.
   Every message records its model and reasoning effort.
6. Codex may optionally run focused existing checks in its native sandbox.
   Claude and Antigravity may each request one approved argv command;
   Roundtable executes it without a shell in a fresh request-scoped project
   copy, then returns the real result for that participant's final contribution.
7. Add a steering note at any time. It is added to the transcript before the next agent turn.
8. If an agent call fails, Roundtable pauses that exact turn without changing the
   transcript. Retry the same agent and context, or end the discussion cleanly.
9. Only after the final agent turn, Codex produces a structured Completion
   Brief with the decision, rationale, owned next actions, and open questions.
   It follows the transcript in the conversation scroll and replaces the
   now-inapplicable steering composer. You can skip it without losing the
   transcript.
10. Optionally enable **Dissent check**. After Codex freezes the ordinary brief,
   each agent gets one separate review pass and can identify labeled positions
   the brief missed or flattened. Mark each item **Represented** or **Missed**;
   those judgments are saved locally.
11. If you opt in, open **History** to revisit recent discussions after a bridge
   restart. Archived discussions are read-only and keep undelivered steering
   notes visibly separate from the transcript.
12. Stop the discussion whenever you want.

The workspace changes with the room lifecycle. Setup keeps the goal,
connection, and participant controls beside a conversation preview. Once a
discussion starts, those controls collapse into a locked session summary so the
live transcript becomes primary. Opening local history creates a visibly
read-only archive state, and **New discussion** returns every room surface
through one reset path.

Active discussions survive a refresh in the same browser tab while the bridge
remains running. Completed transcripts can be copied or exported as Markdown from
the room header.

The live room exposes concise, polite turn-status announcements without reading
whole agent replies aloud. Its transcript is a labeled keyboard-focusable log
with a visible inset focus ring, progress reports completed turns through native
progressbar semantics, and automatic transcript scrolling becomes instant when
the operating system requests reduced motion. Opening an archive does not replay
its transcript through the live announcement channel.

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
- can be turned off for future discussions, deleted record by record, or cleared
  from the History drawer.

Set `ROUNDTABLE_HISTORY=off` before `npm run talk` to disable archive storage and
its API entirely. `ROUNDTABLE_HISTORY_DIR` can override the user-data location.

## Optional dissent check

The dissent check is a deliberately small measurement experiment, not an
automatic claim about consensus. It requires local history and adds one
post-brief review pass per agent. The completion brief is synthesized from the
normal transcript only and frozen before either review starts.

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

- uses the same agent, model, reasoning level, turn number, and deterministically
  rebuilt prompt;
- never duplicates completed messages;
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
