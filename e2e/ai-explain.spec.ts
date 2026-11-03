import { test, expect, type Page } from "@playwright/test";
import { openPalette, send } from "./support/app";
import { ECHO } from "./support/echo";

// D4.10, docs/design/ai/actions.md 3: Explain this response, in the exchange record of a status of 400 or more. The
// body sent is the body shown (AI-3), the response body goes only when ticked for that call (AI-4), and the answer
// is text with nothing to accept.

const MODEL = "http://127.0.0.1:4300/model";
/** This test's model name: the mock keeps every test's calls in one list, and two workers share it. */
let modelName = "";
const received = async (page: Page) =>
  ((await (await page.request.get(`${MODEL}/received`)).json()) as string[]).filter((body) =>
    body.includes(`"model": "${modelName}"`),
  );
/** The response body `/status/422` sends, as it reads inside the prompt's JSON. */
const QUOTED_BODY = '{\\"status\\":422}';

test.beforeEach(async ({ page }, info) => {
  modelName = `explain-model-${info.workerIndex}-${info.repeatEachIndex}-${Date.now()}`;
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

async function sendTo(page: Page, path: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  await page.locator("input.address-url").fill(`${ECHO}${path}`);
  await send(page);
}

test("Explain this response shows the call first, sends the body only when ticked, and shows the answer as text", async ({
  page,
}) => {
  await sendTo(page, "/status/422");
  await expect(page.locator(".status-badge")).toHaveText("422");
  await page.locator(".record-toggle").click();
  const record = page.getByRole("region", { name: "Exchange record" });
  await record.getByRole("button", { name: "Explain this response…" }).click();

  const preview = record.getByRole("region", { name: "Ask the model to explain this response" });
  await expect(preview.getByRole("heading", { name: "Ask the model to explain this response" })).toBeFocused();
  const tick = preview.getByRole("checkbox", { name: "The response body" });
  await expect(tick).not.toBeChecked();
  await tick.check();
  await expect(preview.getByLabel(/^What is sent/)).toContainText(QUOTED_BODY);
  const shown = (await preview.getByLabel(/^What is sent/).textContent()) ?? "";
  await preview.getByRole("button", { name: "Send to model" }).click();

  const answer = record.getByRole("region", { name: "The model answered" });
  await expect(answer).toContainText("The server refused the request");
  await expect(answer.getByRole("heading", { name: "The model answered" })).toBeFocused();
  await expect(answer.getByRole("button", { name: "Accept" })).toHaveCount(0);
  const first = await received(page);
  expect(first).toHaveLength(1);
  expect(shown.slice(shown.indexOf("\n\n") + 2)).toBe(first[0]);
  expect(first[0]).toContain(QUOTED_BODY);

  // Ask again: the tick starts unticked, and the body is not sent (AI-4).
  await answer.getByRole("button", { name: "Ask again…" }).click();
  await expect(preview.getByRole("checkbox", { name: "The response body" })).not.toBeChecked();
  await preview.getByRole("button", { name: "Send to model" }).click();
  await expect(answer).toBeVisible();
  const second = await received(page);
  expect(second).toHaveLength(2);
  expect(second[1]).not.toContain(QUOTED_BODY);
});

test("a response under 400 offers no Explain, in the record or the palette", async ({ page }) => {
  await sendTo(page, "/status/200");
  await page.locator(".record-toggle").click();
  await expect(page.getByRole("region", { name: "Exchange record" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Explain this response…" })).toHaveCount(0);
  const field = await openPalette(page);
  await field.fill("Explain the response");
  await expect(page.getByRole("option", { name: /Explain the response/ })).toHaveCount(0);
});

test("the palette asks for Explain and Write tests where their controls are", async ({ page }) => {
  await sendTo(page, "/status/404");
  let field = await openPalette(page);
  await field.fill("Explain the response");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Ask the model to explain this response" })).toBeVisible();

  field = await openPalette(page);
  await field.fill("Write tests from the response");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Ask the model to write tests" })).toBeVisible();
  expect(await received(page)).toHaveLength(0);
});

test("with no provider, a failed response offers no Explain", async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem("wayfarer:ai"));
  await sendTo(page, "/status/500");
  await page.locator(".record-toggle").click();
  await expect(page.getByRole("region", { name: "Exchange record" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Explain this response…" })).toHaveCount(0);
});
