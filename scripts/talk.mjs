import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const token = randomBytes(24).toString("base64url");
const bridgeUrl = "http://127.0.0.1:4317";
const appUrl = `http://localhost:3000/?bridge=${encodeURIComponent(bridgeUrl)}&token=${encodeURIComponent(token)}`;
const children = new Set();

function start(command, args, environment = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...environment },
    stdio: ["inherit", "pipe", "pipe"],
  });
  children.add(child);
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  child.on("close", (code) => {
    children.delete(child);
    if (code && !shuttingDown) shutdown(code);
  });
  return child;
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 200);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

start(process.execPath, ["scripts/bridge.mjs"], {
  ROUNDTABLE_BRIDGE_TOKEN: token,
});

const web = start("npm", ["run", "dev"]);
let opened = false;
web.stdout.on("data", (chunk) => {
  if (opened || !chunk.toString().includes("Local:")) return;
  opened = true;
  console.log("");
  console.log(`  Roundtable: ${appUrl}`);
  console.log("");
  if (process.env.ROUNDTABLE_NO_OPEN === "1") return;
  const opener =
    process.platform === "darwin"
      ? ["open", [appUrl]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", appUrl]]
        : ["xdg-open", [appUrl]];
  const openChild = spawn(opener[0], opener[1], { stdio: "ignore", detached: true });
  openChild.unref();
});
