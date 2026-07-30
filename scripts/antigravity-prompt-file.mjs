import { randomBytes } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function withAntigravityPromptFile({
  workingDirectory,
  prompt,
  run,
  randomName = () => randomBytes(12).toString("hex"),
  write = writeFile,
  remove = rm,
}) {
  const promptFile = join(
    workingDirectory,
    `.roundtable-instructions-${randomName()}.md`,
  );
  let created = false;
  try {
    await write(promptFile, prompt, { encoding: "utf8", mode: 0o600, flag: "wx" });
    created = true;
    return await run(promptFile);
  } finally {
    if (created) await remove(promptFile, { force: true });
  }
}
