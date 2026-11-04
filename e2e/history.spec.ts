import { test, expect } from "@playwright/test";
import { seedAndOpen, send } from "./support/app";
import { ECHO } from "./support/echo";

// U-024: the drawer was cramped where it had room: each row had a box, the address was cut at about 20 characters.
// U-086: Clear history was a red icon 34 px from the drawer's Close.
test("History gives the address the row's width, keeps the boxes for Select…, and keeps Clear history away from Close", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  const address = `${ECHO}/content/json?a-long-query=with-a-value-long-enough-to-matter`;
  await page.locator("input.address-url").fill(address);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
  await page.getByRole("button", { name: "Request history", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Request history" });

  const row = drawer.getByRole("button", { name: /a-long-query/ });
  await expect(row).toBeVisible();
  await expect(drawer.getByRole("checkbox")).toHaveCount(0);
  const shown = await row.locator(".history-address").evaluate((el) => el.getBoundingClientRect().width);
  expect(shown).toBeGreaterThan(300);
  // The status, the time and the age are under the address, as text.
  await expect(row).toContainText("200");

  const clear = drawer.getByRole("button", { name: "Clear history…" });
  const close = drawer.getByRole("button", { name: "Close history" });
  const [a, b] = [await clear.boundingBox(), await close.boundingBox()];
  expect(Math.hypot(a!.x - b!.x, a!.y - b!.y)).toBeGreaterThan(48);

  await drawer.getByRole("button", { name: "Select…", exact: true }).click();
  await expect(drawer.getByRole("checkbox")).toHaveCount(1);
  await drawer.getByRole("button", { name: "Done", exact: true }).click();
  await expect(drawer.getByRole("checkbox")).toHaveCount(0);
});

// L-13 (D5-e): a row said the method and the address, never which saved request it was, and the search found no name.
test("a saved request's send is listed under its name and place, and found by its name", async ({ page }) => {
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/content/json`, folder: {} });
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
  // Edited and not saved: still sent from the saved request.
  await page.locator("input.address-url").fill(`${ECHO}/content/text`);
  await send(page);
  await expect(page.locator(".status-badge")).toHaveText("200", { timeout: 15_000 });
  await page.getByRole("button", { name: "Request history", exact: true }).click();
  const drawer = page.getByRole("dialog", { name: "Request history" });

  const entries = drawer.getByRole("button", { name: /^Tripwire request/ });
  await expect(entries).toHaveCount(2);
  await expect(entries.first()).toContainText("Tripwire collection / Tripwire folder");

  const search = drawer.getByRole("searchbox", { name: "Search history" });
  await expect(search).toHaveAttribute("placeholder", "Search by name, address, method or status");
  await search.fill("tripwire request");
  await expect(entries).toHaveCount(2);
  await search.fill("tripwire request content/text");
  await expect(entries).toHaveCount(1);
  await search.fill("no such request");
  await expect(drawer.getByText("No request in history matches.")).toBeVisible();
});
