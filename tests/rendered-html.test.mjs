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
  assert.match(html, /Round one is sealed and independent/i);
  assert.match(html, /two independent audits and at most one revision/i);
  assert.match(html, /Add files/i);
  assert.match(html, /aria-label="Add files to the discussion prompt"/i);
  assert.match(html, /1 MB each · 3 MB total/i);
  assert.match(html, /role="status"/i);
  assert.match(html, /aria-live="polite"/i);
  assert.match(html, /aria-atomic="true"/i);
  assert.match(html, /TEST CAPABILITY/i);
  assert.match(html, /separate disposable project copies/i);
  assert.match(html, /Claude and Antigravity can each request one approved argv command/i);
  assert.match(html, /Claude(?:&apos;|&#x27;|')s model process remains read-only/i);
  assert.match(html, /Bridge and ambient API credentials are never passed to agent processes/i);
  assert.doesNotMatch(html, /COMPLETION BRIEF/i);
  assert.doesNotMatch(html, /A completion brief will appear here after the agents finish/i);
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
  assert.match(page, /Retry, skip, or end this turn before adding another note/i);
  assert.match(page, /async function addDiscussionRounds/);
  assert.match(page, /sessions\/\$\{sessionId\}\/extend/);
  assert.match(page, /Extends this room without losing its transcript/i);
  assert.match(page, /disabled=\{addingRounds \|\| status !== "running"\}/);
  assert.match(page, /Available as soon as the room is live/i);
  assert.match(page, /SEALED OPENING/);
  assert.match(page, /CROSS-EXAMINATION/);
  assert.match(page, /Draft under audit/i);
  assert.match(page, /Original preserved draft/i);
  assert.match(page, /Partial input · omitted/i);
  assert.match(page, /Reported by/);
  assert.match(page, /Agent-reported, not independently verified/i);
  assert.match(page, /Verified by Roundtable broker/i);
  assert.match(page, /PREPARING ISOLATED WORKSPACES/i);
  assert.match(page, /Preparing one validated source for the role workspaces/i);
  assert.match(page, /snapshot\.phase === "preparing"/);
  assert.match(page, /separate local-only network sandbox/i);
  assert.match(page, /Claude has no shell access/i);
  assert.match(page, /Claude(?:&apos;|')s model process remains read-only/i);
  assert.match(page, /Claude and Antigravity can each request one approved argv command/i);
  assert.match(page, /showCompletionBrief/);
  assert.match(page, /promptAttachments/);
  assert.match(page, /attachmentManifestId/);
  assert.match(page, /const queryProject = params\.get\("project"\)/);
  assert.match(page, /const queryTopic = params\.get\("topic"\)/);
  assert.match(page, /setRounds\(normalizedLaunchRounds\(queryRounds\)\)/);
  assert.match(page, /Attachment set/);
  assert.match(page, /Attachment manifest/);
  assert.match(page, /contentBase64/);
  assert.match(page, /Remove .*attachment\.name/);
  assert.match(page, /feed-outcome/);
  assert.match(page, /roomMode !== "archive" && !showCompletionBrief/);
  assert.doesNotMatch(page, /className="mobile-outcome"/);
  assert.match(page, /Agent-reported checks/i);
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
  assert.match(page, /liveStatusText/);
  assert.match(page, /message\.role !== "human"/);
  assert.match(page, /role="progressbar"/);
  assert.match(page, /aria-valuenow=\{completedTurnCount\}/);
  assert.match(page, /aria-valuetext=\{`\$\{completedTurnCount\} of \$\{totalTurns\} turns complete`\}/);
  assert.match(page, /role="log"/);
  assert.match(page, /aria-label="Discussion transcript"/);
  assert.match(page, /aria-live="off"/);
  assert.match(page, /tabIndex=\{0\}/);
  assert.match(page, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(page, /sessionGenerationRef/);
  assert.match(page, /recoveryTimerRef/);
  assert.match(page, /beginSessionOwnership\(data\.id\)/);
  assert.match(page, /beginSessionOwnership\(id\);\s*applySnapshot\(snapshot, true\)/);
  assert.match(page, /stillOwnsSession\(id, generation\)/);
  assert.match(page, /streamRef\.current = null/);
  assert.match(page, /scheduleRecovery\(id, streamToken, streamBridge, generation, 0\)/);
  assert.doesNotMatch(page, /sessionStorage\.removeItem\("roundtable\.sessionId"\);\s*setStatus\("error"\)/);
  assert.match(page, /async function responseError\(response: Response, fallback: string\)/);
  assert.match(page, /await responseError\(response, "The archived discussion could not be deleted\."/);
  assert.match(page, /await responseError\(response, "Local history could not be cleared\."/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /\.message-feed:focus-visible/);
  assert.match(styles, /\.visually-hidden/);
  assert.match(styles, /\.environment-policy/);
  assert.match(styles, /\.attachment-manifest/);
  assert.match(styles, /\.add-rounds-control/);
  assert.match(styles, /\.brief-audit/);
  assert.match(styles, /\.message-context-warning/);
  assert.doesNotMatch(styles, /\.agent-stack\s*\{\s*display:\s*none/);
  assert.doesNotMatch(page, /Faithful agent summaries|completed with no concerns/i);
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await access(new URL("../public/og.png", import.meta.url));
  await access(new URL("../scripts/bridge.mjs", import.meta.url));
  await access(new URL("../scripts/talk.mjs", import.meta.url));
});
