import { expect, test, type Page } from "@playwright/test";

// Audit 9: the request's tabs showed a dot, a triangle and a count in three shapes, and their widths changed as a
// request was edited, so a tab moved from under a pointer. One slot, a count or nothing, always the same width.

const tabBoxes = (page: Page) =>
  page.locator("app-composer .composer-pane [role='tab']").evaluateAll((tabs) =>
    tabs.map((tab) => {
      const { x, width } = tab.getBoundingClientRect();
      return `${tab.textContent?.trim().split(/\s+/)[0]} ${Math.round(x * 10) / 10},${Math.round(width * 10) / 10}`;
    }),
  );

test("the request's tabs keep their place and width as headers, a body and auth are added", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  const before = await tabBoxes(page);
  expect(before).toHaveLength(6);

  await page.getByRole("tab", { name: "Headers" }).click();
  await page.getByRole("button", { name: "Add header" }).click();
  await page
    .getByRole("textbox", { name: /^Header name/ })
    .first()
    .fill("Accept");
  await expect(page.getByRole("tab", { name: "Headers (1 set)" })).toBeVisible();
  expect(await tabBoxes(page)).toEqual(before);

  await page.getByRole("tab", { name: "Body" }).click();
  await page.getByRole("combobox", { name: "Body type", exact: true }).click();
  await page.getByRole("option", { name: "Raw" }).click();
  await expect(page.getByRole("tab", { name: "Body (1 set)" })).toBeVisible();
  expect(await tabBoxes(page)).toEqual(before);
});

// A count of two digits has room too: the tabs after it do not move. Over 99 it reads "99+", a few px wider.
test("the request's tabs keep their place and width with 12 parameters, and move a few px at most with 120", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  const before = await tabBoxes(page);
  const start = (boxes: string[]) => boxes.map((box) => Number(box.split(" ")[1]?.split(",")[0]));
  for (const count of [12, 120]) {
    const query = Array.from({ length: count }, (_, i) => `p${i}=1`).join("&");
    await page.locator("input.address-url").fill(`https://example.com/?${query}`);
    await expect(page.getByRole("tab", { name: `Params (${count} set)` })).toBeVisible();
    const now = await tabBoxes(page);
    if (count === 12) expect(now).toEqual(before);
    else for (const [i, x] of start(now).entries()) expect(Math.abs(x - start(before)[i]!)).toBeLessThanOrEqual(6);
  }
});

// WCAG 2.5.8: the pointer's way to close a tab and the New tab button are each at least 24 by 24 px.
test("a request tab's close mark and the New tab button are 24 px targets", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/");
  const close = page.locator(".request-tab-close").first();
  await page.locator(".request-tabs [role='tab']").first().hover();
  for (const target of [close, page.getByRole("button", { name: "New tab" })]) {
    const box = await target.boundingBox();
    // Firefox lays the box out at 23.99997: a hundredth of a pixel is not a smaller target.
    expect(box?.width).toBeGreaterThan(23.99);
    expect(box?.height).toBeGreaterThan(23.99);
  }
});
