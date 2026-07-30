import assert from "node:assert/strict";
import test from "node:test";
import { withAntigravityPromptFile } from "../scripts/antigravity-prompt-file.mjs";

test("delivers the exact Antigravity prompt by absolute one-use file", async () => {
  const calls = [];
  const result = await withAntigravityPromptFile({
    workingDirectory: "/private/tmp/antigravity-workspace",
    prompt: "complete control prompt",
    randomName: () => "fixed",
    write: async (...args) => calls.push(["write", ...args]),
    remove: async (...args) => calls.push(["remove", ...args]),
    run: async (promptFile) => {
      calls.push(["run", promptFile]);
      return "reply";
    },
  });

  assert.equal(result, "reply");
  assert.equal(
    calls[0][1],
    "/private/tmp/antigravity-workspace/.roundtable-instructions-fixed.md",
  );
  assert.equal(calls[0][2], "complete control prompt");
  assert.deepEqual(calls[0][3], { encoding: "utf8", mode: 0o600, flag: "wx" });
  assert.deepEqual(calls[1], [
    "run",
    "/private/tmp/antigravity-workspace/.roundtable-instructions-fixed.md",
  ]);
  assert.deepEqual(calls[2], [
    "remove",
    "/private/tmp/antigravity-workspace/.roundtable-instructions-fixed.md",
    { force: true },
  ]);
});

test("removes the prompt file when the Antigravity process fails", async () => {
  const removed = [];
  await assert.rejects(
    withAntigravityPromptFile({
      workingDirectory: "/private/tmp/antigravity-workspace",
      prompt: "control prompt",
      randomName: () => "failure",
      write: async () => {},
      remove: async (path) => removed.push(path),
      run: async () => {
        throw new Error("synthetic process failure");
      },
    }),
    /synthetic process failure/,
  );
  assert.deepEqual(removed, [
    "/private/tmp/antigravity-workspace/.roundtable-instructions-failure.md",
  ]);
});

test("does not unlink a path when prompt creation never completed", async () => {
  let removed = false;
  await assert.rejects(
    withAntigravityPromptFile({
      workingDirectory: "/private/tmp/antigravity-workspace",
      prompt: "control prompt",
      write: async () => {
        throw new Error("synthetic write failure");
      },
      remove: async () => {
        removed = true;
      },
      run: async () => "unreachable",
    }),
    /synthetic write failure/,
  );
  assert.equal(removed, false);
});
