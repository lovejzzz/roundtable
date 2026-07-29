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
  assert.match(html, /<title>Roundtable — Codex and Claude, in one room<\/title>/i);
  assert.match(html, /ROUNDTABLE/);
  assert.match(html, /Two agents\. One project\./);
  assert.match(html, /Start the roundtable/);
  assert.match(html, /Steer the next turn/i);
  assert.match(html, /aria-label="Codex model"/i);
  assert.match(html, /aria-label="Claude model"/i);
  assert.match(html, /aria-label="Codex reasoning effort"/i);
  assert.match(html, /aria-label="Claude reasoning effort"/i);
  assert.match(html, /Model overrides are locked during a live discussion/i);
  assert.match(html, /property="og:image"/i);
  assert.match(html, /\/og\.png/i);
});

test("removes every starter-preview marker", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /SkeletonPreview|codex-preview|react-loading-skeleton/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview|_sites-preview/);
  assert.doesNotMatch(packageJson, /site-creator-vinext-starter|react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await access(new URL("../public/og.png", import.meta.url));
  await access(new URL("../scripts/bridge.mjs", import.meta.url));
  await access(new URL("../scripts/talk.mjs", import.meta.url));
});
