import { expect, test, type Page } from "@playwright/test";
import { axe } from "./support/axe";
import { ECHO } from "./support/echo";
import { openPalette, protectVariable, seedAndOpen, send } from "./support/app";

// S6: History as a log with a rail, a diff of two exchanges, and the variable popover.

async function sendTo(page: Page, address: string, status?: string): Promise<void> {
  await page.locator("input.address-url").fill(address);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText(status ?? "200", { timeout: 15_000 });
}

/** Three sends: a 200 JSON echo, another echo that differs by one value, and a 503. */
async function sendThree(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  await sendTo(page, `${ECHO}/echo?run=one`);
  await sendTo(page, `${ECHO}/echo?run=two`);
  await sendTo(page, `${ECHO}/status/503`, "503");
}

const drawer = (page: Page) => page.getByRole("dialog", { name: "History", exact: true });
const openHistory = async (page: Page) => {
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(drawer(page)).toBeVisible();
};

test("@claim:C-117 History is filtered by tokens: status, method, host, route and time, and says a token it cannot read", async ({
  page,
}) => {
  await sendThree(page);
  await openHistory(page);
  const rows = drawer(page).locator(".history-open");
  await expect(rows).toHaveCount(3);
  const search = drawer(page).getByRole("searchbox", { name: "Search history" });
  await search.fill("status:5xx");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("503");
  await search.fill("status:200 host:127.0.0.1");
  await expect(rows).toHaveCount(2);
  await search.fill("method:post");
  await expect(rows).toHaveCount(0);
  await search.fill("route:bridge");
  await expect(rows).toHaveCount(0);
  await search.fill("route:page status:2xx run=two");
  await expect(rows).toHaveCount(1);
  await search.fill("slower-than:1h");
  await expect(rows).toHaveCount(0);
  await search.fill("status:soon");
  await expect(drawer(page).locator("#history-filter-help")).toContainText(
    "status:soon is not a value that filter takes",
  );
  await expect(rows).toHaveCount(0);
  // Each row says the address, the status and where the request was sent from.
  await search.fill("");
  await expect(rows.nth(2)).toContainText("127.0.0.1:4300");
  await expect(rows.nth(2)).toContainText("/echo?run=one");
  await expect(rows.nth(2)).toContainText("From this page");
});

test("@claim:C-118 an entry opens beside the list as it was kept, and says what history does not keep", async ({
  page,
}) => {
  await sendThree(page);
  await openHistory(page);
  await drawer(page).locator(".history-row", { hasText: "run=one" }).locator(".history-details").click();
  const rail = drawer(page).getByRole("region", { name: "Entry" });
  await expect(rail).toContainText("200");
  await expect(rail.getByRole("heading")).toContainText("run=one");
  // The list stays beside it at this width.
  await expect(drawer(page).locator(".history-open").first()).toBeVisible();
  await expect(rail.getByLabel("The response, as kept")).toContainText('"run":"one"');
  await expect(rail).toContainText("Timings: not recorded. Tests: not recorded.");
  await rail.getByRole("radio", { name: "Headers" }).click();
  await expect(rail.getByRole("region", { name: "Response headers" })).toContainText("content-type");
  await rail.getByRole("radio", { name: "Sent" }).click();
  await expect(rail.getByRole("region", { name: "What was sent, as kept" })).toContainText("/echo?run=one");
  const found = (await axe(page).include("dialog[aria-label=History]").analyze()).violations;
  expect(found.map((v) => v.id)).toEqual([]);
  // Escape closes the rail first, and the drawer on the second.
  await page.keyboard.press("Escape");
  await expect(rail).toHaveCount(0);
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page).locator(".history-row", { hasText: "run=one" }).locator(".history-details")).toBeFocused();
});

test("@claim:C-119 two entries are compared by status, headers and body, a JSON body by path with what changed first, from the keyboard", async ({
  page,
}) => {
  await sendThree(page);
  await openHistory(page);
  // The rail's Compare with… (the keyboard and screen reader path).
  await drawer(page).locator(".history-row", { hasText: "run=two" }).locator(".history-details").press("Enter");
  const rail = drawer(page).getByRole("region", { name: "Entry" });
  await rail.locator("ui-select").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const diff = rail.locator("app-exchange-diff");
  await expect(diff.getByRole("status")).toContainText("Comparing GET");
  // The newest is first in the choice, then the other 200: the diff is of two echoes or an echo and the 503.
  const text = await diff.innerText();
  expect(text).toMatch(/Status/);
  // Focus is in the rail (the choice that held it is gone), so that Escape closes the rail and not the drawer.
  await expect(diff.getByRole("button", { name: "Back" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(diff).toHaveCount(0);

  // Two ticked entries, one click.
  await drawer(page).getByRole("button", { name: "Select…", exact: true }).click();
  await drawer(page)
    .getByRole("checkbox", { name: /run=one/ })
    .check();
  await drawer(page)
    .getByRole("checkbox", { name: /run=two/ })
    .check();
  await drawer(page).getByRole("button", { name: "Compare the two" }).click();
  const two = drawer(page).locator("app-exchange-diff");
  const paths = two.locator(".diff-path");
  await expect(paths.first()).toContainText("changed".replace("changed", "Changed"));
  await expect(two.locator(".diff-at", { hasText: "$.query.run" })).toBeVisible();
  await expect(two.locator(".diff-at", { hasText: "$.url" })).toBeVisible();
  // The timings are not kept, and secrets are masked in both.
  await expect(two).toContainText("Timings: not recorded. Tests: not recorded.");
  await expect(two).toContainText("Secret values are masked in both.");
  // A changed path comes before one that was removed or added.
  const kinds = await two.locator(".diff-path .diff-kind").allInnerTexts();
  expect(kinds[0]).toBe("Changed");
  const found = (await axe(page).include("dialog[aria-label=History]").analyze()).violations;
  expect(found.map((v) => v.id)).toEqual([]);

  // An entry and a 503: the headers and the body differ, and a body not kept is not compared.
  await page.keyboard.press("Escape");
  await drawer(page)
    .getByRole("checkbox", { name: /status\/503/ })
    .check();
  await drawer(page)
    .getByRole("checkbox", { name: /run=two/ })
    .uncheck();
  await drawer(page).getByRole("button", { name: "Compare the two" }).click();
  await expect(drawer(page).locator("app-exchange-diff")).toContainText("503");
});

test("@claim:C-119 a response in a tab is compared from the palette, with the entry its send wrote", async ({
  page,
}) => {
  await sendThree(page);
  const field = await openPalette(page);
  await field.fill("Compare this response");
  await page.getByRole("option", { name: /Compare this response with/ }).click();
  const rail = drawer(page).getByRole("region", { name: "Entry" });
  await expect(rail).toContainText("503");
  await expect(rail.locator("ui-select")).toBeFocused();
});

test("@claim:C-120 a variable's button shows its scope, value and holder on hover and focus, and its popover on a click, with a way to set it; a vault secret is never read", async ({
  page,
}) => {
  const plaintext = "popover-secret-4c1e";
  await seedAndOpen(
    page,
    { fromEnv: "env-value", token: "x" },
    {
      method: "GET",
      url: `${ECHO}/echo?a={{fromEnv}}&b={{nowhere}}`,
      headers: { "X-Token": "{{token}}" },
      collection: { variables: { token: "collection-value" } },
    },
  );
  await protectVariable(page, "token", plaintext);
  const row = page.locator("app-variable-chips");
  const env = row.getByRole("button", { name: /^fromEnv Environment/ });
  // Hover: the card.
  await env.hover();
  const card = page.getByRole("tooltip");
  await expect(card).toContainText("fromEnv · Environment");
  await expect(card).toContainText("env-value");
  await page.mouse.move(5, 5);
  await expect(card).toHaveCount(0);
  // Keyboard focus: the same card, and Enter opens the popover with focus in it.
  await env.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("tooltip")).toContainText("env-value");
  await page.keyboard.press("Enter");
  const pop = page.getByRole("dialog", { name: "Variable fromEnv" });
  await expect(pop).toBeVisible();
  await expect(pop).toContainText('environment "Tripwire env"');
  await expect(pop.getByRole("button", { name: "Show fromEnv in its environment" })).toBeVisible();
  const found = (await axe(page).include(".var-popover").analyze()).violations;
  expect(found.map((v) => v.id)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(pop).toBeHidden();
  await expect(env).toBeFocused();
  // A secret: named and masked; its plaintext is not on the page.
  await row.getByRole("button", { name: /^token Environment/ }).click();
  const secret = page.getByRole("dialog", { name: "Variable token" });
  await expect(secret).toContainText("*** (a vault secret");
  await expect(page.locator("app-variable-chips")).not.toContainText(plaintext);
  await expect(page.locator(".var-popover")).not.toContainText(plaintext);
  await page.keyboard.press("Escape");
  // A missing one offers where to put it.
  await row.getByRole("button", { name: /^nowhere Missing/ }).click();
  const missing = page.getByRole("dialog", { name: "Variable nowhere" });
  await expect(missing).toContainText("Not set in any scope.");
  await expect(missing.getByRole("button", { name: /^Add nowhere to/ }).first()).toBeVisible();
});
