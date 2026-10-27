import { test, expect, type Page } from "@playwright/test";
import { protectVariable, seedAndOpen, send } from "./support/app";
import { routeThroughBridge, startBridge } from "./support/bridge";
import { axe } from "./support/axe";
import { ECHO } from "./support/echo";

// D4.12: the exchange record says what a send did, one sentence per field, from what the app sent and received.
// Each test sends one request and finds each sentence equal to what that exchange did.

const HOST = "127.0.0.1:4300";

/** The record's sentences, by field, once the person opens it. */
async function openRecord(page: Page): Promise<Record<string, string>> {
  const toggle = page.locator(".record-toggle");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  return readRecord(page);
}

async function readRecord(page: Page): Promise<Record<string, string>> {
  const record = page.getByRole("region", { name: "Exchange record" });
  await expect(record).toBeVisible();
  const lines = record.locator("li");
  const fields: Record<string, string> = {};
  for (const line of await lines.all()) {
    const field = (await line.getAttribute("class"))?.replace(/^record-/, "") ?? "";
    fields[field] = (await line.textContent()) ?? "";
  }
  return fields;
}

test("direct: the first line names the route and the host, and the record stays closed after a success", async ({
  page,
}) => {
  await page.goto("/app/");
  await page.locator("input.address-url").fill(`${ECHO}/echo`);
  await send(page);
  await expect(page.locator(".response-announcement")).toHaveText(/^200 OK, [\d.]+ ms, Direct to 127\.0\.0\.1:4300$/);
  await expect(page.locator(".record-toggle")).toHaveText(`Direct to ${HOST}`);
  await expect(page.getByRole("region", { name: "Exchange record" })).toHaveCount(0);
  expect(await openRecord(page)).toEqual({
    route: `Sent from this page to ${HOST}.`,
    secrets: "No vault secret was filled.",
    masked: "Nothing was masked.",
    kept: "History kept the request and the response.",
  });
});

test("through the Local Bridge: the record says the bridge sent it", async ({ page }) => {
  const bridge = await startBridge();
  try {
    await page.goto("/app/");
    await routeThroughBridge(page, bridge);
    await page.locator("input.address-url").fill(`${ECHO}/echo`);
    await send(page);
    await expect(page.locator(".response-announcement")).toHaveText(
      /^200 OK, [\d.]+ ms, Local Bridge to 127\.0\.0\.1:4300$/,
    );
    expect((await openRecord(page)).route).toBe(`Sent through the Local Bridge to ${HOST}.`);
  } finally {
    bridge.stop();
  }
});

test("with a vault secret: the record names the variable and its environment, never the value", async ({ page }) => {
  const plaintext = "record-e2e-secret-4f1c";
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo`, headers: { "X-Api-Key": "{{apiKey}}" } });
  await protectVariable(page, "apiKey", plaintext);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  const record = await openRecord(page);
  expect(record).toEqual({
    route: `Sent from this page to ${HOST}.`,
    secrets: 'Filled from the vault: apiKey, from environment "Tripwire env". Each is *** in what is kept.',
    masked: "Masked with *** in what is kept: X-Api-Key and the response body.",
    kept: "History kept the request and the response.",
  });
  await expect(page.getByRole("region", { name: "Exchange record" })).not.toContainText(plaintext);
});

test("with a masked header: a credential typed by hand is listed as masked", async ({ page }) => {
  await page.goto("/app/");
  await page.locator("input.address-url").fill(`${ECHO}/echo`);
  await page.locator("app-composer").getByRole("tab", { name: "Headers", exact: true }).click();
  await page.locator("app-headers-panel").getByPlaceholder("Name", { exact: true }).first().fill("Authorization");
  await page
    .locator("app-headers-panel")
    .getByPlaceholder("Value", { exact: true })
    .first()
    .fill("Bearer typed-by-hand");
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  const record = await openRecord(page);
  expect(record.secrets).toBe("No vault secret was filled.");
  expect(record.masked).toBe("Masked with *** in what is kept: Authorization and the response body.");
});

test("a failed send opens the record with what the browser reported and what to do", async ({ page }) => {
  await page.goto("/app/");
  await page.locator("input.address-url").fill("http://127.0.0.1:9/nothing-listens");
  await send(page);
  await expect(page.locator(".response-announcement")).toHaveText(
    "The request got no response. Direct to 127.0.0.1:9, no bridge paired.",
  );
  await expect(page.locator(".record-toggle")).toHaveAttribute("aria-expanded", "true");
  const record = await readRecord(page);
  expect(record.route).toBe("Sent from this page to 127.0.0.1:9. No Local Bridge is paired.");
  expect(record.kept).toBe("History kept the request. No response came.");
  expect(record.failure).toMatch(
    /^What was reported: (Failed to fetch|NetworkError when attempting to fetch resource\.|Load failed)$/,
  );
  const region = page.getByRole("region", { name: "Exchange record" });
  // No bridge is paired in a new browser: it is set up in place (bridge-setup.spec.ts has the paired case).
  await expect(region.locator(".bridge-command")).toHaveText("npx wayfarer-bridge");
  await expect(region.getByLabel("Pairing code", { exact: true })).toBeVisible();
});

for (const theme of ["light", "dark"] as const) {
  test(`the open record fits the window at every layout width, 320 px up, in the ${theme} theme`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem("wayfarer:theme", value), theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/app/");
    // A long host, one word: it must wrap inside the record, not widen the page.
    await page.locator("input.address-url").fill(`http://${"a".repeat(60)}.invalid/`);
    await send(page);
    const record = page.getByRole("region", { name: "Exchange record" });
    await expect(record).toBeVisible();
    for (const width of [1440, 1220, 1200, 1024, 900, 820, 768, 767, 640, 420, 390, 360, 320]) {
      await page.setViewportSize({ width, height: 900 });
      // Off the Send button's tooltip, which a narrow layout puts over the Response tab.
      await page.mouse.move(width - 2, 898);
      if (width === 767) await page.getByRole("tab", { name: "Response", exact: true }).click();
      const toggle = await page.locator(".record-toggle").boundingBox();
      expect(toggle!.x + toggle!.width, `the status line at ${width} px`).toBeLessThanOrEqual(width);
      await expect(record).toBeVisible();
      const box = await record.boundingBox();
      expect(box!.x + box!.width, `the record at ${width} px`).toBeLessThanOrEqual(width);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        `the page at ${width} px`,
      ).toBeLessThanOrEqual(width);
    }
  });
}

test("before Send, the preview names the environment's secret that hides the collection's value; so does the record", async ({
  page,
}) => {
  const plaintext = "preview-e2e-secret-91ab";
  await seedAndOpen(
    page,
    {},
    {
      method: "GET",
      url: `${ECHO}/echo`,
      auth: { type: "inherit" },
      collection: { auth: { type: "bearer", token: "{{token}}" }, variables: { token: "collection-value" } },
    },
  );
  await protectVariable(page, "token", plaintext);
  const preview = page.locator("app-variable-chips");
  await expect(preview.locator(".preview-address")).toHaveText(`Sends to ${ECHO}/echo`);
  await expect(preview.locator(".preview-auth")).toHaveText(
    'Auth: Bearer token, from collection "Tripwire collection". {{token}} comes from the environment Tripwire env, as a vault secret.',
  );
  const chip = preview.getByRole("button", { name: /^token environment "Tripwire env"/ });
  await expect(chip).toContainText("*** from the vault");
  await expect(chip).toContainText('Hides the value in collection "Tripwire collection"');
  await expect(preview).not.toContainText(plaintext);
  await expect(preview).not.toContainText("collection-value");

  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200");
  const record = await openRecord(page);
  expect(record.secrets).toBe(
    'Filled from the vault: token, from environment "Tripwire env". Each is *** in what is kept.',
  );
  await expect(page.getByRole("region", { name: "Exchange record" })).not.toContainText(plaintext);
});

test("the preview's chip for a variable with no value adds it to the environment, its value to type", async ({
  page,
}) => {
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/{{nowhere}}` });
  await expect(page.locator("app-variable-chips .preview-address")).toHaveText(`Sends to ${ECHO}/{{nowhere}}`);
  const chip = page.getByRole("button", { name: /^nowhere Missing/ });
  await expect(chip).toContainText("No value");
  await chip.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Environments", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByPlaceholder("KEY", { exact: true }).last()).toHaveValue("nowhere");
  await dialog.getByPlaceholder("Value", { exact: true }).last().fill("echo");
  await dialog.getByRole("button", { name: "Close", exact: true }).first().click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("app-variable-chips .preview-address")).toHaveText("Sends to http://127.0.0.1:4300/echo");
});

for (const theme of ["light", "dark"] as const) {
  test(`the preview and the open record have no WCAG 2.2 AA violation in the ${theme} theme`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem("wayfarer:theme", value), theme);
    await seedAndOpen(
      page,
      { host: "127.0.0.1:4300" },
      {
        method: "GET",
        url: "http://{{host}}/{{nowhere}}",
        auth: { type: "inherit" },
        collection: { auth: { type: "bearer", token: "{{host}}" }, variables: { host: "shadowed" } },
      },
    );
    await expect(page.locator("app-variable-chips .var-chip-shadows")).toBeVisible();
    await page.mouse.move(5, 5);
    const preview = await axe(page).include("app-variable-chips").analyze();
    expect(preview.violations.map((violation) => violation.id)).toEqual([]);

    await page.locator("input.address-url").fill("http://127.0.0.1:9/nothing-listens");
    await send(page);
    await expect(page.getByRole("region", { name: "Exchange record" })).toBeVisible();
    await page.mouse.move(5, 5);
    const record = await axe(page).include("#exchange-record").include(".response-status").analyze();
    expect(record.violations.map((violation) => violation.id)).toEqual([]);
  });
}
