// Tests for social-images.mjs and og-path.mjs (W3.1 of PLAN-design.md). Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { fit, cardText, pagePath } from "../social-images.mjs";
import { ogImagePath } from "./og-path.mjs";

test("a page's image is under /og/ by its path, the front page's index.png", () => {
  assert.equal(ogImagePath("/"), "/og/index.png");
  assert.equal(ogImagePath("/docs/auth/"), "/og/docs/auth.png");
  assert.equal(ogImagePath("/docs/design/reach/"), "/og/docs/design/reach.png");
});

test("a built file's path is the page's address, and the image of that address is the one its metadata names", () => {
  assert.equal(pagePath("index.html"), "/");
  assert.equal(pagePath("docs/auth/index.html"), "/docs/auth/");
  assert.equal(ogImagePath(pagePath("compare/postman/index.html")), "/og/compare/postman.png");
});

test("the card's text is the page's title without the site's suffix, and its description, unescaped", () => {
  const html =
    '<title>Auth: Wayfarer docs</title><meta name="description" content="Sign in &amp; send: &quot;Basic&quot;"/>';
  assert.deepEqual(cardText(html), { title: "Auth", description: 'Sign in & send: "Basic"' });
  assert.equal(cardText("<title>Auth: Wayfarer API client docs</title>").title, "Auth");
  assert.equal(cardText("<title>Roadmap: Wayfarer API client</title>").title, "Roadmap");
  assert.equal(
    cardText("<title>Wayfarer: an API client in your browser</title>").title,
    "Wayfarer: an API client in your browser",
  );
});

test("a card's description ends on a sentence or a whole word, never mid-word, and 404.html is the 404 page's", () => {
  assert.equal(fit("Short.", 150), "Short.");
  assert.equal(fit("One sentence here. Two sentences that run on and on past the end", 30), "One sentence here.");
  assert.equal(fit("No install, no account, no server of ours", 30), "No install, no account, no…");
  assert.equal(pagePath("404.html"), "/404/");
});

test("a WOFF font becomes the TrueType file resvg reads: its tables, inflated, behind a new directory", async () => {
  const { readFileSync } = await import("node:fs");
  const { woffToSfnt } = await import("../social-images.mjs");
  const woff = readFileSync(
    new URL("../../../node_modules/@fontsource/figtree/files/figtree-latin-400-normal.woff", import.meta.url),
  );
  const font = woffToSfnt(woff);
  assert.equal(font.readUInt32BE(0), woff.readUInt32BE(4));
  assert.equal(font.readUInt16BE(4), woff.readUInt16BE(12));
  assert.equal(font.length % 4, 0);
  assert.throws(() => woffToSfnt(Buffer.from("not a font")), /not a WOFF/);
});
