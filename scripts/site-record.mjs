#!/usr/bin/env node
// The landing's recordings of the app (W5.2 of PLAN-design.md): the app as built, at a phone's width so that its
// text reads on a phone, driven by Playwright in Chromium. Three clips, each in both themes: the first request, the
// exchange record saying where it went, and a collection run's report. Every answer is made up here (`page.route`)
// and every other address is refused, so a recording never reaches the network; the app is the real one.
//
// Each clip is the page's screenshots, taken one after another while it plays, put together by ffmpeg as WebM (VP9)
// and MP4 (H.264), with its last frame as the poster (AVIF): the still a reader sees before Play, and all a reader
// who asked for reduced motion is shown, since nothing plays by itself.
//
// A script of its own beside site-screenshot.mjs, which takes the stills: a clip needs a seeded database, a phone's
// window, a capture loop and ffmpeg, and the stills need none of them; what the two share is the made-up answer.
//
// Usage: npm run build && npm run gen:recordings   (serves dist/deploy itself on PORT, default 4570; needs ffmpeg
// with libvpx-vp9, libx264 and libsvtav1 on the PATH)
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { startServer } from "../e2e/support/prod-server.mjs";

const PORT = Number(process.env.PORT ?? 4570);
const BASE = `http://localhost:${PORT}`;
const OUT = "packages/site/public/recordings";
/** A phone's window: shown at this size on the landing, the app's 13 px text stays 13 px. */
const VIEWPORT = { width: 390, height: 720 };
const SCALE = 2;

const API = "https://api.example.com";
const USER = { id: 42, name: "Ada Lovelace", email: "ada@example.com", roles: ["admin", "editor"] };
/** What api.example.com answers, by method and path. */
const ANSWERS = {
  "GET /v1/users/42": [200, USER],
  "POST /v1/users": [201, { ...USER, id: 43, name: "Grace Hopper", email: "grace@example.com" }],
  "DELETE /v1/users/43": [204, null],
};

/** The collection the record and the run use: three requests, each with a test, its scripts trusted as written here. */
const COLLECTION = [
  {
    name: "Get a user",
    method: "GET",
    url: `${API}/v1/users/42`,
    headers: { Authorization: "Bearer {{token}}" },
    post: 'pm.test("status is 200", () => pm.response.to.have.status(200));',
  },
  {
    name: "Create a user",
    method: "POST",
    url: `${API}/v1/users`,
    body: JSON.stringify({ name: "Grace Hopper", email: "grace@example.com" }, null, 2),
    post: 'pm.test("created", () => pm.response.to.have.status(201));',
  },
  {
    name: "Delete a user",
    method: "DELETE",
    url: `${API}/v1/users/43`,
    post: 'pm.test("no content", () => pm.response.to.have.status(204));',
  },
];

/** Answers api.example.com from ANSWERS and refuses every address but the app's own. */
async function cannedNetwork(context) {
  await context.route(
    (url) => url.origin !== BASE,
    (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== API) return route.abort("blockedbyclient");
      const cors = {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "*",
      };
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      const answer = ANSWERS[`${request.method()} ${url.pathname}`];
      if (!answer) return route.fulfill({ status: 404, headers: cors });
      const [status, body] = answer;
      return route.fulfill({
        status,
        headers: cors,
        contentType: "application/json",
        body: body === null ? undefined : JSON.stringify(body),
      });
    },
  );
}

/** Writes COLLECTION and an environment into the app's database, as the e2e suite seeds it, and reloads. */
async function seed(page) {
  await page.waitForFunction(async () =>
    (await indexedDB.databases()).some((db) => db.name === "wayfarer" && db.version === 2),
  );
  await page.evaluate(async (requests) => {
    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open("wayfarer");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const read = db.transaction("meta").objectStore("meta").get("state");
    const state = await new Promise((resolve) => (read.onsuccess = () => resolve(read.result)));
    const now = Date.now();
    const meta = (id) => ({ id, createdAt: now, updatedAt: now });
    const rows = (record) => Object.entries(record).map(([key, value]) => ({ key, value, enabled: true }));
    const digest = async (text) =>
      Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
    const approved = await Promise.all(requests.map((request) => digest(request.post)));
    const tx = db.transaction(["environments", "collections", "requests", "meta"], "readwrite");
    tx.objectStore("environments").put({
      id: "env-prod",
      meta: meta("env-prod"),
      name: "Production",
      vars: rows({ token: "eyJhbGciOiJIUzI1NiJ9.d2F5ZmFyZXI" }),
      order: 0,
    });
    tx.objectStore("meta").put({ ...(state ?? {}), key: "state", activeEnvironmentId: "env-prod" });
    tx.objectStore("collections").put({
      id: "col-users",
      meta: meta("col-users"),
      name: "Users",
      order: 0,
      variables: [],
      auth: { type: "none" },
      scripts: { pre: "", post: "" },
      scriptTrust: { trusted: true, approved },
    });
    requests.forEach((request, order) =>
      tx.objectStore("requests").put({
        id: `req-${order}`,
        meta: meta(`req-${order}`),
        collectionId: "col-users",
        name: request.name,
        order,
        method: request.method,
        url: request.url,
        params: [],
        headers: rows(request.headers ?? {}),
        body:
          request.body === undefined
            ? { mode: "none" }
            : { mode: "raw", raw: { language: "json", text: request.body } },
        auth: { type: "none" },
        scripts: { pre: "", post: request.post },
        tests: [],
        settings: {},
      }),
    );
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, COLLECTION);
  await page.reload();
  await page.locator("input.address-url").waitFor();
}

/** Opens the collections drawer and the request or collection named, as a phone's reader would. */
async function openInTree(page, name, button = "left") {
  await page.getByRole("button", { name: "Show sidebar" }).click();
  await page.getByRole("tree").getByText(name, { exact: true }).click({ button });
}

const pause = (page, ms) => page.waitForTimeout(ms);

const CLIPS = {
  /** Type an address, send, read the answer. */
  async "first-request"(page) {
    await pause(page, 800);
    await page.locator("input.address-url").click();
    await page.keyboard.type(`${API}/v1/users/42`, { delay: 45 });
    await pause(page, 500);
    await page.getByRole("button", { name: "Send request" }).click();
    await page.locator(".status-badge").filter({ hasText: "200" }).waitFor();
    await pause(page, 2500);
  },
  /** Send a saved request whose header holds a credential, and open the record of what was sent and kept. */
  async record(page) {
    await openInTree(page, "Get a user");
    await page.locator("input.address-url").waitFor();
    await pause(page, 800);
    await page.getByRole("button", { name: "Send request" }).click();
    await page.locator(".status-badge").filter({ hasText: "200" }).waitFor();
    await pause(page, 1200);
    await page.locator(".record-toggle").click();
    const record = page.getByRole("region", { name: "Exchange record" });
    await record.waitFor();
    await record.scrollIntoViewIfNeeded();
    await pause(page, 3500);
  },
  /** Run the collection and read its report. */
  async run(page) {
    await openInTree(page, "Users", "right");
    await page.getByRole("menuitem", { name: "Run…" }).click();
    const view = page.locator("app-run-view");
    await view.getByRole("heading", { name: "Run Users" }).waitFor();
    await pause(page, 1000);
    await view.getByRole("button", { name: "Run", exact: true }).click();
    await view.getByRole("status").filter({ hasText: "The run is complete." }).waitFor({ timeout: 30_000 });
    await pause(page, 3500);
  },
};

/** Records `clip` in `theme`: the page's frames while it plays, and its last frame as the poster. */
async function record(browser, name, theme) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE, colorScheme: theme });
  await context.addInitScript((theme) => localStorage.setItem("wayfarer:theme", theme), theme);
  await cannedNetwork(context);
  const page = await context.newPage();
  await page.goto(`${BASE}/app/`);
  await page.locator("input.address-url").waitFor();
  // The first request starts from an empty app; the others from the collection, seeded before the clip starts.
  if (name !== "first-request") await seed(page);
  const frames = await mkdtemp(join(tmpdir(), "site-record-"));
  try {
    // Screenshots one after another while the clip plays, each timed by the clock: Chrome's screencast gave its
    // frames at the window's CSS size, half of what a phone's screen shows.
    const list = [];
    let playing = true;
    const capture = (async () => {
      while (playing) list.push({ data: await page.screenshot({ type: "png" }), time: Date.now() / 1000 });
    })();
    const start = Date.now() / 1000;
    await CLIPS[name](page);
    playing = false;
    await capture;
    const end = Date.now() / 1000;
    // Each frame lasts until the next; the first starts the clip, the last holds to its end.
    const lines = ["ffconcat version 1.0"];
    for (const [i, frame] of list.entries()) {
      const file = join(frames, `${String(i).padStart(5, "0")}.png`);
      await writeFile(file, frame.data);
      const from = i === 0 ? start : frame.time;
      const to = i + 1 < list.length ? list[i + 1].time : end;
      lines.push(`file '${file}'`, `duration ${Math.max(to - from, 0.001).toFixed(3)}`);
    }
    // The concat demuxer takes the last file's duration only when the file is named again after it.
    lines.push(`file '${join(frames, `${String(list.length - 1).padStart(5, "0")}.png`)}'`);
    await writeFile(join(frames, "list.txt"), `${lines.join("\n")}\n`);
    const stem = `${OUT}/${name}-${theme}`;
    const input = ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(frames, "list.txt")];
    const video = ["-vf", "fps=30,format=yuv420p", "-an"];
    execFileSync("ffmpeg", [
      ...input,
      ...video,
      "-c:v",
      "libvpx-vp9",
      "-b:v",
      "0",
      "-crf",
      "40",
      "-row-mt",
      "1",
      `${stem}.webm`,
    ]);
    execFileSync("ffmpeg", [
      ...input,
      ...video,
      ...["-c:v", "libx264", "-preset", "slow", "-crf", "28", "-profile:v", "high", "-movflags", "+faststart"],
      `${stem}.mp4`,
    ]);
    // The poster as AVIF: a browser fetches every poster with the page, hidden or not, and six JPEG posters
    // (450 kB) held the landing's text back on Lighthouse's phone, from 1.4 to 3.8 s (performance 100 to 89).
    const still = join(frames, "poster.png");
    await page.screenshot({ path: still });
    // SVT-AV1 writes its banner to stderr whatever the log level: kept, and shown only if ffmpeg fails.
    execFileSync(
      "ffmpeg",
      [
        ...["-y", "-loglevel", "error", "-i", still, "-c:v", "libsvtav1"],
        ...["-crf", "40", "-pix_fmt", "yuv420p", "-frames:v", "1", "-f", "avif", `${stem}.avif`],
      ],
      { stdio: "pipe" },
    );
    console.log(`site-record: ${stem}.{webm,mp4,avif}, ${(end - start).toFixed(1)} s, ${list.length} frames`);
  } finally {
    await rm(frames, { recursive: true, force: true });
    await context.close();
  }
}

const server = startServer("dist/deploy", PORT);
const browser = await chromium.launch();
try {
  for (const name of Object.keys(CLIPS)) for (const theme of ["dark", "light"]) await record(browser, name, theme);
} finally {
  await browser.close();
  server.close();
}
