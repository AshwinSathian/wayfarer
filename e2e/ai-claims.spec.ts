import { test, expect, type Page } from "@playwright/test";
import { TARGET, captureTarget, protectVariable, seedAndOpen, send } from "./support/app";
import { ECHO } from "./support/echo";

// D4.10's claims that need more than one action's spec: a prompt holds no secret (AI-2), an accepted script runs
// only where the request's scripts may run (AI-11), and nothing but Send to model calls a model (AI-12). Scripts run
// in QuickJS under the production CSP: run with CI=1.

// The imported collection's target is a routed fake host, which the app's service worker would hide in WebKit.
test.use({ serviceWorkers: "block" });

const MODEL = "http://127.0.0.1:4300/model";
let modelName = "";
const received = async (page: Page) =>
  ((await (await page.request.get(`${MODEL}/received`)).json()) as string[]).filter((body) =>
    body.includes(`"model": "${modelName}"`),
  );

test.beforeEach(async ({ page }, info) => {
  modelName = `claims-model-${info.workerIndex}-${info.repeatEachIndex}-${Date.now()}`;
  await page.addInitScript(
    ({ address, model }) =>
      localStorage.setItem(
        "wayfarer:ai",
        JSON.stringify({
          kind: "openai",
          address,
          model,
          route: "direct",
          actions: { tests: true, draft: true, explain: true },
        }),
      ),
    { address: `${MODEL}/v1`, model: modelName },
  );
});

/** Write tests from the open tab's response, the body ticked or not, and wait for the proposal. */
async function writeTests(page: Page, withBody: boolean): Promise<void> {
  await page
    .locator("app-response-viewer")
    .getByRole("tab", { name: /^Tests/ })
    .click();
  await page.getByRole("button", { name: "Write tests from this response…" }).click();
  const preview = page.getByRole("region", { name: "Ask the model to write tests" });
  if (withBody) await preview.getByRole("checkbox", { name: "The response body" }).check();
  await preview.getByRole("button", { name: "Send to model" }).click();
  await expect(page.getByRole("region", { name: "Proposed tests" })).toBeVisible();
}

/** A row of the Tests tab's results. */
const result = (page: Page, label: string) => page.locator(".test-result-pass, .test-result-fail", { hasText: label });

test("@claim:C-070 a prompt holds no vault secret's plaintext and no credential, though the response echoed both", async ({
  page,
}) => {
  test.slow();
  const secret = "vault-plaintext-ai2-5e1a";
  const bearer = "typed-bearer-ai2-90cd";
  await seedAndOpen(
    page,
    {},
    {
      method: "POST",
      url: `${ECHO}/echo`,
      headers: { "X-Api-Key": "{{API_TOKEN}}" },
      body: { token: "{{API_TOKEN}}" },
      auth: { type: "bearer", token: bearer },
    },
  );
  await protectVariable(page, "API_TOKEN", secret);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  // The echo server sends both back in its body: the prompt quotes that body as history keeps it, masked.
  await writeTests(page, true);
  const bodies = await received(page);
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toContain("***");
  expect(bodies[0]).not.toContain(secret);
  expect(bodies[0]).not.toContain(bearer);
  expect(bodies[0]).not.toContain(Buffer.from(secret).toString("base64"));
});

test("@claim:C-079 accepted tests run at the next send of a request typed here", async ({ page }) => {
  await page.goto("/app/");
  await page.locator("input.address-url").fill(`${ECHO}/echo`);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await writeTests(page, false);
  await expect(result(page, "status is 200")).toHaveCount(0);
  await page.getByRole("region", { name: "Proposed tests" }).getByRole("button", { name: "Accept" }).click();
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await page
    .locator("app-response-viewer")
    .getByRole("tab", { name: /^Tests/ })
    .click();
  await expect(page.locator(".test-result-pass", { hasText: "status is 200" })).toBeVisible();
});

test("@claim:C-079 accepting tests in a request whose scripts are held lifts no hold, and they do not run", async ({
  page,
}) => {
  const hits = await captureTarget(page);
  await page.goto("/app/");
  await expect(page.locator("input.address-url")).toBeVisible();
  const meta = (id: string) => ({ id, createdAt: 1, updatedAt: 1 });
  await page.locator('app-collections-sidebar input[type="file"]').setInputFiles({
    name: "shared.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        $id: "wayfarer/collection",
        meta: meta("file"),
        collection: {
          id: "col-held",
          meta: meta("col-held"),
          name: "Held collection",
          order: 0,
          variables: [],
          auth: { type: "none" },
          scripts: { pre: "", post: "" },
        },
        folders: [],
        requests: [
          {
            id: "req-held",
            meta: meta("req-held"),
            collectionId: "col-held",
            name: "Held request",
            order: 0,
            method: "GET",
            url: `${TARGET}/held`,
            params: [],
            headers: [],
            body: { mode: "none" },
            auth: { type: "none" },
            scripts: { pre: "", post: 'pm.test("the file\'s script ran", () => {});' },
            tests: [],
            settings: {},
          },
        ],
      }),
    ),
  });
  const importDialog = page.getByRole("dialog", { name: "Import collection" });
  await importDialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(importDialog).toHaveCount(0);
  await page.getByRole("tree").getByText("Held request", { exact: true }).click();
  await expect(page.locator("input.address-url")).toHaveValue(`${TARGET}/held`);

  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await writeTests(page, false);
  await page.getByRole("region", { name: "Proposed tests" }).getByRole("button", { name: "Accept" }).click();

  // Sent again: still held, and neither the file's script nor the accepted tests ran.
  await send(page);
  await expect.poll(() => hits.length).toBe(2);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await page
    .locator("app-response-viewer")
    .getByRole("tab", { name: /^Tests/ })
    .click();
  await expect(page.locator(".scripts-skipped")).toBeVisible();
  await expect(result(page, "status is 200")).toHaveCount(0);
  await expect(result(page, "the file's script ran")).toHaveCount(0);
});

test("@claim:C-080 with a provider set up, sends, a reload and previews that are cancelled call no model", async ({
  page,
}) => {
  await page.goto("/app/");
  await page.locator("input.address-url").fill(`${ECHO}/status/500`);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("500");
  // Each action's preview, opened and cancelled.
  await page
    .locator("app-response-viewer")
    .getByRole("tab", { name: /^Tests/ })
    .click();
  await page.getByRole("button", { name: "Write tests from this response…" }).click();
  await page
    .getByRole("region", { name: "Ask the model to write tests" })
    .getByRole("button", { name: "Cancel" })
    .click();
  await page.locator(".record-toggle").click();
  await page.getByRole("button", { name: "Explain this response…" }).click();
  await page
    .getByRole("region", { name: "Ask the model to explain this response" })
    .getByRole("button", { name: "Cancel" })
    .click();
  await page.reload();
  await page.locator("input.address-url").fill(`${ECHO}/status/500`);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("500");
  await page.waitForTimeout(500);
  expect(await received(page)).toHaveLength(0);
});
