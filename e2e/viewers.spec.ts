import { test, expect, type Page } from "@playwright/test";
import { TARGET, captureTarget, send } from "./support/app";
import { ECHO } from "./support/echo";

// P2.13: a response is shown by its content type, in a view the user can
// change. Each view uses a browser feature the security headers could forbid
// (a blob: frame, a blob: image), so every test here ends by asserting that
// the page reported no CSP or Trusted Types violation (plan risk R15).

// A Playwright-routed target must not be shadowed by the app's service worker.
test.use({ serviceWorkers: "block" });

async function watchViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __violations: string[] }).__violations = seen;
    document.addEventListener("securitypolicyviolation", (e) => seen.push(`${e.effectiveDirective} ${e.blockedURI} ${e.sample}`));
  });
}

async function expectNoViolations(page: Page): Promise<void> {
  expect(await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations)).toEqual([]);
}

async function open(page: Page, url: string): Promise<void> {
  await watchViolations(page);
  await page.goto("/");
  await page.locator("input.address-url").fill(url);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
}

const viewer = (page: Page) => page.locator("app-response-viewer");
const viewSelect = (page: Page) => viewer(page).getByRole("combobox", { name: "View the body as" });

/** Opens the list of views, checks what it offers, and chooses one. */
async function chooseView(page: Page, offered: string[], choice: string): Promise<void> {
  await viewSelect(page).click();
  await expect(page.getByRole("option")).toHaveText(offered);
  await page.getByRole("option", { name: choice, exact: true }).click();
  await expect(viewSelect(page)).toHaveText(choice);
}

/** The text Monaco has drawn, without the non-breaking spaces it writes for indentation. */
const editorText = async (page: Page) => ((await viewer(page).locator(".view-lines").textContent()) ?? "").replace(/\s+/g, "");

test("JSON is formatted, can be filtered by path, and is searched with the editor's find", async ({ page }) => {
  await captureTarget(page, {
    contentType: "application/json",
    body: JSON.stringify({ data: { items: [{ id: 11, name: "first" }, { id: 22, name: "second" }] } }),
  });
  await open(page, `${TARGET}/json`);

  await expect(viewSelect(page)).toHaveText("JSON");
  await expect.poll(() => editorText(page)).toContain('"name":"second"');

  const filter = viewer(page).getByRole("textbox", { name: "Filter the JSON by path" });
  await filter.fill("data.items[*].id");
  await expect.poll(() => editorText(page)).toBe("[11,22]");
  await filter.fill("data.items[1].name");
  await expect.poll(() => editorText(page)).toBe('"second"');
  await filter.fill("data.nothing.here");
  await expect(viewer(page).getByText("Nothing in the body is at that path.")).toBeVisible();
  // A path cannot reach what JSON does not hold (F63).
  await filter.fill("data.constructor");
  await expect(viewer(page).getByText("Nothing in the body is at that path.")).toBeVisible();
  await filter.fill("");
  await expect.poll(() => editorText(page)).toContain('"name":"first"');

  // Monaco reads the platform from the user agent, which a Playwright device sets: not always the host's.
  await viewer(page).locator(".view-lines").click();
  await page.keyboard.press((await page.evaluate(() => navigator.userAgent.includes("Macintosh"))) ? "Meta+f" : "Control+f");
  await expect(viewer(page).locator(".find-widget.visible")).toBeVisible();
  await page.keyboard.press("Escape");
  await chooseView(page, ["JSON", "Text", "XML", "Preview"], "Text");
  await expect(viewer(page).locator("pre")).toContainText('"name":"second"');

  await expectNoViolations(page);
});

test("plain text is shown as it was sent", async ({ page }) => {
  await open(page, `${ECHO}/content/text`);
  await expect(viewSelect(page)).toHaveText("Text");
  await expect(viewer(page).locator("pre")).toHaveText("echo fixture\n");
  await expectNoViolations(page);
});

test("@claim:C-009 XML is indented, and Text shows it as it was sent", async ({ page }) => {
  await open(page, `${ECHO}/content/xml`);
  await expect(viewSelect(page)).toHaveText("XML");
  // One line per element: the fixture is a single line.
  await expect(viewer(page).locator(".view-line")).toHaveText(['<?xml version="1.0"?>', "<fixture>", /^\s+<name>echo<\/name>$/, "</fixture>"]);

  await chooseView(page, ["XML", "Text", "Preview"], "Text");
  await expect(viewer(page).locator("pre")).toHaveText('<?xml version="1.0"?><fixture><name>echo</name></fixture>');
  await expectNoViolations(page);
});

test("@claim:C-048 the HTML preview draws the page and nothing else: no script runs, nothing is loaded, and a link goes nowhere", async ({ page }) => {
  const LEAK = "https://preview-leak.test";
  const html = `<!doctype html><html><head>
    <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' data:">
    <meta http-equiv="refresh" content="0;url=${LEAK}/refresh">
    <link rel="stylesheet" href="${LEAK}/style.css">
    <style>h1 { color: rgb(0, 128, 0); }</style>
    <script>document.title = "ran"; document.write("<p id='written'>script ran</p>"); fetch("${LEAK}/fetch");</script>
    <script src="${LEAK}/script.js"></script>
    </head><body>
    <h1>Preview heading</h1>
    <img src="${LEAK}/pixel.png" alt="">
    <img id="inline" alt="inline" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==">
    <a id="out" href="${LEAK}/link">a link</a>
    <a id="self" target="_self" href="${LEAK}/link-self">a link that names this frame</a>
    <form action="${LEAK}/form"><button id="submit">Submit</button></form>
    <iframe src="${LEAK}/frame"></iframe>
    <div onclick="fetch('${LEAK}/onclick')" id="clickme">click me</div>
    </body></html>`;
  await captureTarget(page, { contentType: "text/html; charset=utf-8", body: html });

  // Every request that leaves for the network is counted here. (Chromium also
  // announces a request its policy then refuses; such a request never gets this far.)
  const leaked: string[] = [];
  await page.route(`${LEAK}/**`, (route) => {
    leaked.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/html", body: "<p>left the preview</p>" });
  });
  const answered: string[] = [];
  page.on("response", (response) => {
    if (response.url().startsWith(LEAK)) answered.push(response.url());
  });
  const popups: Page[] = [];
  page.context().on("page", (popup) => popups.push(popup));

  await open(page, `${TARGET}/page`);

  await expect(viewSelect(page)).toHaveText("Preview");
  const element = viewer(page).locator("iframe.html-preview");
  // No allow-* token: no scripts, no forms, no popups, no same-origin.
  await expect(element).toHaveAttribute("sandbox", "");
  await expect.poll(() => element.evaluate((frame: HTMLIFrameElement) => frame.src)).toMatch(/^blob:/);
  const previewUrl = await element.evaluate((frame: HTMLIFrameElement) => frame.src);
  const frame = page.frameLocator("iframe.html-preview");

  // The page is drawn, with its own styles and a data: image.
  await expect(frame.getByRole("heading", { name: "Preview heading" })).toBeVisible();
  await expect(frame.getByRole("heading")).toHaveCSS("color", "rgb(0, 128, 0)");
  // The script did not run.
  await expect(frame.locator("#written")).toHaveCount(0);

  // Clicks that would leave: a link, a link that names this frame, a form, an inline handler.
  await frame.locator("#clickme").click();
  await frame.locator("#out").click();
  await frame.locator("#submit").click();
  // Time for a refresh, a navigation or a request to happen if one were going to.
  await page.waitForTimeout(1_500);

  expect(leaked).toEqual([]);
  expect(answered).toEqual([]);
  expect(popups).toEqual([]);
  // The preview is still the document it was given. (The frame inside it is counted apart: it was refused and holds an error page or nothing.)
  const frames = () => page.frames().map((candidate) => candidate.url());
  const preview = () => page.mainFrame().childFrames().map((candidate) => candidate.url());
  expect(preview()).toEqual([previewUrl]);
  expect(frames().some((url) => url.startsWith(LEAK))).toBe(false);
  await expect(frame.getByRole("heading", { name: "Preview heading" })).toBeVisible();
  // Nothing so far needed the app's own policy to step in.
  await expectNoViolations(page);

  // The last line of defence: a link that names the frame itself gets past the
  // preview's <base>, and the app's frame-src (blob: only) refuses the navigation.
  await frame.locator("#self").click();
  await page.waitForTimeout(1_000);
  expect(leaked).toEqual([]);
  expect(frames().some((url) => url.startsWith(LEAK))).toBe(false);
  // Reported once per policy: the page has the header and the same policy as a <meta>.
  const refused = await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations);
  expect(refused.length).toBeGreaterThan(0);
  for (const violation of refused) expect(violation).toMatch(/^frame-src https:\/\/preview-leak\.test/);

  // The source is there to read.
  await chooseView(page, ["Preview", "Text", "XML"], "Text");
  await expect(viewer(page).locator("pre")).toContainText("<h1>Preview heading</h1>");
});

test("no other origin can put the app in a frame", async ({ page, baseURL }) => {
  // frame-ancestors is 'self' so that the preview's blob: frame loads in WebKit (plan D25). It must still refuse everyone else.
  const response = await page.goto("/");
  const policy = response?.headers()["content-security-policy"] ?? "";
  expect(policy).toContain("frame-ancestors 'self'");
  expect(policy).toContain("frame-src blob:;");

  const framer = { status: 200, contentType: "text/html", body: `<h1>framer</h1><iframe src="${baseURL}/"></iframe>` };
  const framed = () => page.mainFrame().childFrames()[0]?.locator("input.address-url");

  // The app's own origin may: this is what "the app was drawn in the frame" looks like.
  await page.route(`${baseURL}/framer`, (route) => route.fulfill(framer));
  await page.goto(`${baseURL}/framer`);
  await expect.poll(() => framed()?.isVisible()).toBe(true);

  // Another origin, the same page: the frame stays empty.
  await page.route("http://framer.test/", (route) => route.fulfill(framer));
  await page.goto("http://framer.test/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "framer" })).toBeVisible();
  await page.waitForTimeout(2_000);
  // A refused frame may have no document to ask (Firefox never answers for it): that is "not drawn" too.
  const drawn = await Promise.race([
    framed()?.isVisible().catch(() => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3_000)),
  ]);
  expect(drawn).not.toBe(true);
});

test("@claim:C-009 an image is shown from a blob: URL that is revoked when the response changes", async ({ page }) => {
  // Firefox still draws a revoked blob: image from its cache, so the revocation itself is recorded.
  await page.addInitScript(() => {
    const revoked: string[] = [];
    (window as unknown as { __revoked: string[] }).__revoked = revoked;
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url: string) => {
      revoked.push(url);
      revoke(url);
    };
  });
  const revoked = () => page.evaluate(() => (window as unknown as { __revoked: string[] }).__revoked);

  await open(page, `${ECHO}/content/png`);
  await expect(viewSelect(page)).toHaveText("Image");
  const image = viewer(page).locator("img.response-image");
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  const url = await image.evaluate((img: HTMLImageElement) => img.src);
  expect(url).toMatch(/^blob:/);
  expect(await revoked()).not.toContain(url);
  await expect(viewer(page).getByText("Binary response (70 bytes, image/png)")).toBeVisible();

  await chooseView(page, ["Image", "Hex"], "Hex");
  await expect(viewer(page).locator("pre.hex-dump")).toContainText("00000000  89 50 4e 47 0d 0a 1a 0a");
  await expect(viewer(page).locator("pre.hex-dump")).toContainText("|.PNG....");
  // The image is gone from the page, and so is its URL.
  await expect(image).toHaveCount(0);
  await expect.poll(revoked).toContain(url);

  await chooseView(page, ["Image", "Hex"], "Image");
  await expect(image).toBeVisible();
  const second = await image.evaluate((img: HTMLImageElement) => img.src);
  expect(second).not.toBe(url);
  await page.locator("input.address-url").fill(`${ECHO}/content/text`);
  await send(page);
  await expect(viewer(page).locator("pre")).toHaveText("echo fixture\n");
  await expect.poll(revoked).toContain(second);

  await expectNoViolations(page);
});

test("@claim:C-009 other binary is a hex dump with the exact bytes to download", async ({ page }) => {
  await open(page, `${ECHO}/content/octet`);
  await expect(viewSelect(page)).toHaveCount(0);
  await expect(viewer(page).locator("pre.hex-dump")).toHaveText(`00000000  00 01 02 03 fe ff${" ".repeat(30)}  |......|`);

  const [download] = await Promise.all([page.waitForEvent("download"), viewer(page).getByRole("button", { name: "Download response body" }).click()]);
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  expect(Buffer.concat(chunks)).toEqual(Buffer.from([0, 1, 2, 3, 254, 255]));
  await expectNoViolations(page);
});

test("the Headers tab says once that the browser withholds headers of a response from another origin", async ({ page }) => {
  await open(page, `${ECHO}/cors/full`);
  await viewer(page).getByRole("tab", { name: "Headers" }).click();
  const note = viewer(page).locator(".headers-note");
  await expect(note).toHaveCount(1);
  await expect(note).toContainText("Access-Control-Expose-Headers");
  // The server exposed x-custom, and nothing else it sent beyond the safelist is listed.
  const names = await viewer(page).locator("table.ds-table th").allTextContents();
  expect(names).toContain("x-custom");
  expect(names).not.toContain("access-control-allow-origin");
  await expectNoViolations(page);
});

test("a response from the app's own origin has no such note", async ({ page, baseURL }) => {
  await open(page, new URL("/manifest.webmanifest", baseURL).href);
  await viewer(page).getByRole("tab", { name: "Headers" }).click();
  await expect(viewer(page).locator("table.ds-table th").first()).toBeVisible();
  await expect(viewer(page).locator(".headers-note")).toHaveCount(0);
  await expectNoViolations(page);
});
