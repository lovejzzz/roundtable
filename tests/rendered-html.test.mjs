import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html", host: "localhost" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Roundtable room", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Roundtable — Codex, Claude, and Antigravity<\/title>/i);
  assert.match(html, /ROUNDTABLE/);
  assert.match(html, /Three agents\. One project\./);
  assert.match(html, /Connect bridge to start/);
  assert.match(html, /workspace-grid setup-mode/);
  assert.match(html, />History</i);
  assert.match(html, /Steer the next turn/i);
  assert.match(html, /aria-label="Codex model"/i);
  assert.match(html, /aria-label="Claude model"/i);
  assert.match(html, /aria-label="Antigravity model"/i);
  assert.match(html, /aria-label="Codex reasoning effort"/i);
  assert.match(html, /aria-label="Claude reasoning effort"/i);
  assert.match(html, /aria-label="Antigravity reasoning effort"/i);
  assert.match(html, /Model and effort are sent as separate CLI settings/i);
  assert.match(html, /Model and reasoning choices lock when the room starts/i);
  assert.match(html, /TEST CAPABILITY/i);
  assert.match(html, /separate disposable project copies/i);
  assert.match(html, /Claude remains read-only/i);
  assert.match(html, /separate brokered runner/i);
  assert.match(html, /Bridge and ambient API credentials are never passed to agent processes/i);
  assert.match(html, /id="outcome-title"/i);
  assert.match(html, /COMPLETION BRIEF/i);
  assert.match(html, /A completion brief will appear here after the agents finish/i);
  assert.match(html, /property="og:image"/i);
  assert.match(html, /\/og\.png/i);
});

test("keeps the room implementation production-owned and state-driven", async () => {
  const [page, layout, packageJson, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /SkeletonPreview|codex-preview|react-loading-skeleton/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview|_sites-preview/);
  assert.doesNotMatch(packageJson, /site-creator-vinext-starter|react-loading-skeleton/);
  assert.match(page, /Retry failed turn|Retry .* turn|failed-turn-card/i);
  assert.match(page, /Retry or end this turn before adding another note/i);
  assert.match(page, /Reported by \{message\.author\}/i);
  assert.match(page, /Agent-reported, not independently verified/i);
  assert.match(page, /Claude has no shell access/i);
  assert.match(page, /Claude remains read-only/i);
  assert.match(page, /Codex and\s+Antigravity can use them/i);
  assert.match(page, /Agent-reported checks — \$\{message\.author\}/i);
  assert.match(page, /Summaries · not independently verified/i);
  assert.match(page, /Agent-stated summaries; not independently verified/i);
  assert.match(page, /No concerns reported/i);
  assert.match(page, /represented/);
  assert.match(page, /missed/);
  assert.match(page, /const roomMode:/);
  assert.match(page, /function resetToSetup\(\)/);
  assert.match(page, /shouldAutoScrollRef/);
  assert.match(page, /role-specific runtime and configuration settings/i);
  assert.match(page, /scrollHeight - feed\.scrollTop - feed\.clientHeight <= 72/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /\.environment-policy/);
  assert.doesNotMatch(styles, /\.agent-stack\s*\{\s*display:\s*none/);
  assert.doesNotMatch(page, /Faithful agent summaries|completed with no concerns/i);
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await access(new URL("../public/og.png", import.meta.url));
  await access(new URL("../scripts/bridge.mjs", import.meta.url));
  await access(new URL("../scripts/talk.mjs", import.meta.url));
});
