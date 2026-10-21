// Tests for social-images.mjs and og-path.mjs (W3.1 of PLAN-design.md). Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { cardText, pagePath } from "../social-images.mjs";
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
  assert.equal(
    cardText("<title>Wayfarer: an API client in your browser</title>").title,
    "Wayfarer: an API client in your browser",
  );
});
