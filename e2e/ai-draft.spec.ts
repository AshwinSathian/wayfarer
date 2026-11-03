import { test, expect, type Page } from "@playwright/test";
import { dumpIdb, openPalette, seedAndOpen } from "./support/app";
import { ECHO } from "./support/echo";

// D4.10, docs/design/ai/actions.md 2: Draft a request from a description. The prompt is not a template (AI-8), one
// that names a vault secret is not sent (AI-9), an answer that names one is refused (AI-10), and nothing changes
// until Accept, which Undo takes back (AI-5).

const MODEL = "http://127.0.0.1:4300/model";
/** This test's model name: the mock keeps every test's calls in one list, and two workers share it. */
let modelName = "";
const received = async (page: Page) =>
  ((await (await page.request.get(`${MODEL}/received`)).json()) as string[]).filter((body) =>
    body.includes(`"model": "${modelName}"`),
  );
const storedTabs = async (page: Page) => JSON.stringify((await dumpIdb(page))["tabs"]);

test.beforeEach(async ({ page }, info) => {
  modelName = `draft-model-${info.workerIndex}-${info.repeatEachIndex}-${Date.now()}`;
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

async function describe(page: Page, text: string) {
  const dialog = page.getByRole("dialog", { name: "Draft a request" });
  await expect(dialog.getByLabel("Description")).toBeFocused();
  await dialog.getByLabel("Description").fill(text);
  await dialog.getByRole("button", { name: "Preview…" }).click();
  return dialog;
}

test("a drafted request goes into a new tab only on Accept, its prompt is sent as written, and Undo empties it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedAndOpen(page, { baseUrl: ECHO }, { method: "GET", url: "{{baseUrl}}/echo" });
  const field = await openPalette(page);
  await field.fill("Draft a request");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Draft a request" });
  await expect(dialog.getByRole("checkbox", { name: /^The names of the variables in use: baseUrl/ })).toBeChecked();
  await describe(page, "List the pets at {{baseUrl}}");

  const preview = dialog.getByRole("region", { name: "Ask the model to draft a request" });
  const sent = preview.getByLabel(/^What is sent/);
  await expect(sent).toContainText("Variables that have values: baseUrl.");
  const shown = (await sent.textContent()) ?? "";
  await preview.getByRole("button", { name: "Send to model" }).click();
  const proposal = dialog.getByRole("region", { name: "Proposed request" });
  await expect(proposal).toContainText("{{baseUrl}}/pets");

  // What was shown is what the model received, and {{baseUrl}} went as written, not as its value (AI-3, AI-8).
  const bodies = await received(page);
  expect(bodies).toHaveLength(1);
  expect(shown.slice(shown.indexOf("\n\n") + 2)).toBe(bodies[0]);
  expect(bodies[0]).toContain("List the pets at {{baseUrl}}");
  expect(bodies[0]).not.toContain(ECHO);

  // Nothing changed before Accept (AI-5): one tab, its address as it was, and nothing of the proposal stored.
  await page.waitForTimeout(400);
  const strip = page.getByRole("tablist", { name: "Open requests" }).getByRole("tab");
  await expect(strip).toHaveCount(1);
  expect(await storedTabs(page)).not.toContain("/pets");

  // The open tab is a saved request: Accept opens a new one, and leaves the saved one alone.
  await proposal.getByRole("button", { name: "Accept" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(strip).toHaveCount(2);
  await expect(page.locator("input.address-url")).toHaveValue("{{baseUrl}}/pets");
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await expect(undo).toBeFocused();
  await expect.poll(() => storedTabs(page)).toContain("/pets");
  await undo.click();
  await expect(page.locator("input.address-url")).toHaveValue("");
  await expect(page.locator("input.address-url")).toBeFocused();
  await expect(page.getByRole("status").filter({ hasText: "Put back as it was." })).toHaveCount(1);
  await expect.poll(() => storedTabs(page)).not.toContain("/pets");
});

test("a tab with nothing typed is filled by Accept, not joined by another", async ({ page }) => {
  await page.goto("/app/");
  await page.getByRole("button", { name: "Describe a request…" }).click();
  const dialog = await describe(page, "List the pets");
  await dialog.getByRole("button", { name: "Send to model" }).click();
  await dialog.getByRole("region", { name: "Proposed request" }).getByRole("button", { name: "Accept" }).click();
  await expect(page.locator("input.address-url")).toHaveValue("{{baseUrl}}/pets");
  await expect(page.getByRole("tablist", { name: "Open requests" }).getByRole("tab")).toHaveCount(1);
  // Nothing is sent by Accept: Send is the person's.
  await expect(page.locator(".status-badge")).toHaveCount(0);
});

test("a description that names a vault secret is not sent", async ({ page }) => {
  await page.goto("/app/");
  await page.getByRole("button", { name: "Describe a request…" }).click();
  const dialog = await describe(page, "Send {{$secret.abc}} as the token");
  await expect(dialog.getByText(/names a vault secret/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Send to model" })).toBeDisabled();
  expect(await received(page)).toHaveLength(0);
});

test("an answer that names a vault secret is refused, and the draft is unchanged", async ({ page }) => {
  await page.goto("/app/");
  await page.getByRole("button", { name: "Describe a request…" }).click();
  const dialog = await describe(page, "A request that would name a secret");
  await dialog.getByRole("button", { name: "Send to model" }).click();
  await expect(dialog.getByText(/The answer names a vault secret/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Accept" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.locator("input.address-url")).toHaveValue("");
});

test("with no provider, there is no Describe a request… and no palette command", async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem("wayfarer:ai"));
  await page.goto("/app/");
  await expect(page.getByText("Send a request and its response shows here.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Describe a request…" })).toHaveCount(0);
  const field = await openPalette(page);
  await field.fill("Draft a request");
  await expect(page.getByRole("option", { name: /Draft a request/ })).toHaveCount(0);
});
