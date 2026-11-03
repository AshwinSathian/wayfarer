import { test, expect, type Page } from "@playwright/test";
import { dumpIdb, send } from "./support/app";
import { ECHO } from "./support/echo";

// D4.10, docs/design/ai/actions.md 1: Write tests from this response. Nothing changes until Accept (AI-5); the
// response body is sent only when ticked for that call (AI-4); the body sent is the body shown (AI-3).

const MODEL = "http://127.0.0.1:4300/model";
/** This test's model name: the mock keeps every test's calls in one list, and two workers share it. */
let modelName = "";
const received = async (page: Page) =>
  ((await (await page.request.get(`${MODEL}/received`)).json()) as string[]).filter((body) =>
    body.includes(`"model": "${modelName}"`),
  );
const storedTabs = async (page: Page) => JSON.stringify((await dumpIdb(page))["tabs"]);

test.beforeEach(async ({ page }, info) => {
  modelName = `test-model-${info.workerIndex}-${info.repeatEachIndex}-${Date.now()}`;
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

test("@claim:C-071 @claim:C-072 @claim:C-073 Write tests from this response proposes tests, Accept adds them, and Undo puts the script back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  await page.locator("input.address-url").fill(`${ECHO}/echo?pet=rex`);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  await page.getByRole("tab", { name: /^Tests/ }).click();
  const ask = page.getByRole("button", { name: "Write tests from this response…" });

  // First call: the body ticked, and it is in what the model received; the preview's body is what it received.
  await ask.click();
  const preview = page.getByRole("region", { name: "Ask the model to write tests" });
  const tick = preview.getByRole("checkbox", { name: "The response body" });
  await expect(tick).not.toBeChecked();
  await expect(preview.getByLabel(/^What is sent/)).not.toContainText('pet=rex\\\\"');
  await tick.check();
  // The tick redraws what is sent; Send waits for it.
  await expect(preview.getByLabel(/^What is sent/)).toContainText('\\"query\\"');
  const shown = (await preview.getByLabel(/^What is sent/).textContent()) ?? "";
  await preview.getByRole("button", { name: "Send to model" }).click();
  const proposal = page.getByRole("region", { name: "Proposed tests" });
  await expect(proposal).toContainText("Adds 1 test to the post-response script.");
  const first = await received(page);
  expect(first).toHaveLength(1);
  expect(shown.slice(shown.indexOf("\n\n") + 2)).toBe(first[0]);
  expect(first[0]).toContain('\\"query\\"');
  // Nothing changed before Accept (AI-5).
  await page.waitForTimeout(400);
  expect(await storedTabs(page)).not.toContain("status is 200");
  await proposal.getByRole("button", { name: "Accept" }).click();
  const said = page.locator(".ai-tests-said");
  await expect(said).toHaveText("Added 1 test to the post-response script.");
  await expect.poll(() => storedTabs(page)).toContain("status is 200");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(said).toHaveText("Put back as it was.");
  await expect.poll(() => storedTabs(page)).not.toContain("status is 200");

  // Second call: the tick starts unticked again, and the body is not sent (AI-4).
  await ask.click();
  await expect(preview.getByRole("checkbox", { name: "The response body" })).not.toBeChecked();
  await preview.getByRole("button", { name: "Send to model" }).click();
  await expect(proposal).toBeVisible();
  const second = await received(page);
  expect(second).toHaveLength(2);
  expect(second[1]).not.toContain('\\"query\\"');
});

test("@claim:C-069 with no provider, the Tests tab offers no AI action", async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem("wayfarer:ai"));
  await page.goto("/app/");
  await page.locator("input.address-url").fill(`${ECHO}/echo`);
  await send(page);
  await page.getByRole("tab", { name: /^Tests/ }).click();
  await expect(page.getByRole("button", { name: "Write tests from this response…" })).toHaveCount(0);
});
