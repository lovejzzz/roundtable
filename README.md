# Roundtable

Roundtable gives Codex CLI and Claude CLI one visible, steerable project discussion.

Current release: **v0.0.0.1**

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
4. Codex and Claude alternate turns, inspecting the same project and reading the same shared transcript. Every message records its model and reasoning effort.
5. Add a steering note at any time. It is added to the transcript before the next agent turn.
6. Stop the discussion whenever you want.

Active discussions survive a refresh in the same browser tab while the bridge remains running. Completed transcripts can be copied or exported as Markdown from the room header.

The bridge binds only to `127.0.0.1` and requires a fresh random key on every run. This first version keeps both agents in discussion-only mode: Codex uses a read-only sandbox; Claude runs in safe mode with only Read, Glob, and Grep available. On macOS, the bridge also places Claude behind an OS-level guard that denies writes inside the selected project.

Steering notes are held until a turn boundary so the transcript remains chronological. Stopping or timing out a discussion terminates the full CLI process group and escalates when a child ignores the initial signal.
