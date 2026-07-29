# Roundtable

Roundtable gives Codex CLI and Claude CLI one visible, steerable project discussion.

Current release: **v0.0.0.5**

Roundtable uses four-part development versions. Each completed agent
conversation plus its implemented improvement increments the final field:
`v0.0.0.1`, `v0.0.0.2`, and so on. See [CHANGELOG.md](CHANGELOG.md) for the
discussion outcome and implementation details behind every release.

## Start it

Both CLIs must already be installed and signed in. From this folder:

```bash
npm run talk
```

The command starts the local bridge and the web room, then opens the connected room in your browser. Press `Control-C` in the terminal to stop both.

## How a discussion works

1. Choose an absolute project folder and a discussion goal.
2. Review or change the model shown under each CLI participant. Friendly names such as Claude Opus 5 appear above the exact CLI identifier.
3. Set each agent's reasoning effort with the slider, from low through extra high to max. The bridge starts from each CLI's configured effort.
4. Codex and Claude alternate turns from separate disposable copies of the same
   project and read the same shared transcript. Every message records its model
   and reasoning effort.
5. Each agent may optionally run focused existing tests, linters, type checks, or
   builds before making a claim. Test artifacts stay in its private copy.
6. Add a steering note at any time. It is added to the transcript before the next agent turn.
7. If an agent call fails, Roundtable pauses that exact turn without changing the
   transcript. Retry the same agent and context, or end the discussion cleanly.
8. After the final turn, Codex produces a structured Outcome with the decision,
   rationale, owned next actions, and open questions. You can skip this brief
   without losing the transcript.
9. If you opt in, open **History** to revisit recent discussions after a bridge
   restart. Archived discussions are read-only and keep undelivered steering
   notes visibly separate from the transcript.
10. Stop the discussion whenever you want.

Active discussions survive a refresh in the same browser tab while the bridge
remains running. Completed transcripts can be copied or exported as Markdown from
the room header.

## Local discussion history

Roundtable asks before archiving anything. If you choose **Keep locally**, new
discussions are saved as append-only event logs in the operating system's user
data folder, outside the discussed project. The archive:

- uses owner-only directory and file permissions;
- never stores bridge credentials or SSE tickets in structural event fields;
- lists only topic, project name, date, status, and message count until you open a
  record;
- retains at most 50 discussions for 30 days;
- recovers the valid prefix of a log if its final write was interrupted;
- marks nonterminal discussions as interrupted after a bridge restart;
- can be turned off for future discussions, deleted record by record, or cleared
  from the History drawer.

Set `ROUNDTABLE_HISTORY=off` before `npm run talk` to disable archive storage and
its API entirely. `ROUNDTABLE_HISTORY_DIR` can override the user-data location.

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

Roundtable lazily creates a different temporary project copy for each agent.
Codex receives workspace-write access only inside its CLI sandbox. On macOS,
Claude receives Bash only behind an OS write guard that protects both the real
project and the user's home folder; without that guard, Claude keeps its
read-only Read, Glob, and Grep tool set. The copies omit repository metadata and
generated build directories, reuse installed dependencies when present, and are
deleted when the discussion ends.

Testing remains optional. The discussion prompt asks agents to run only focused,
existing checks when evidence would improve a claim, to report the exact command
and result, and not to intentionally edit source files. A generated artifact or
an accidental edit in one copy cannot change the real project or the other
agent's view.

The bridge binds only to `127.0.0.1` and requires a fresh random key on every run.

Steering notes are held until a turn boundary so the transcript remains chronological. Stopping or timing out a discussion terminates the full CLI process group and escalates when a child ignores the initial signal.
