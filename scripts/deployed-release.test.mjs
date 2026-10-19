// The synthetic monitor tests the release production runs (deployed-release.mjs), and the deploy names it
// (build-deploy.mjs). Run: npm run test:scripts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deployedRelease } from "./deployed-release.mjs";

const answer = (body, type) => async () => new Response(body, { headers: { "content-type": type } });

test("the release is the one production's /version.json names", async () => {
  assert.equal(await deployedRelease("https://example.test", answer('{"version":"2.7.0"}', "application/json")), "v2.7.0");
});

test("a version that is not one is refused, not checked out", async () => {
  for (const version of ["2.7", "2.7.0; rm -rf /", "-2.7.0", 270]) {
    await assert.rejects(
      deployedRelease("https://example.test", answer(JSON.stringify({ version }), "application/json")),
      /version\.json/,
    );
  }
});

test("production that names no release is v2.6.0 (the site's 404) or v2.5.0 (the app's shell at any path)", async () => {
  const notFound = async () => new Response("<!doctype html>", { status: 404, headers: { "content-type": "text/html" } });
  assert.equal(await deployedRelease("https://example.test", notFound), "v2.6.0");
  assert.equal(await deployedRelease("https://example.test", answer("<!doctype html>", "text/html")), "v2.5.0");
});

test("the monitor checks out the release production runs, not the newest tag", () => {
  const workflow = readFileSync(new URL("../.github/workflows/synthetic.yml", import.meta.url), "utf8");
  assert.match(workflow, /node scripts\/deployed-release\.mjs/);
  assert.doesNotMatch(workflow, /git describe/);
});

test("the deploy names its release in /version.json", () => {
  const script = readFileSync(new URL("./build-deploy.mjs", import.meta.url), "utf8");
  assert.match(script, /version\.json/);
});
