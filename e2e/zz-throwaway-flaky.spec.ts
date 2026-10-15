import { expect, test } from "@playwright/test";

// Throwaway (not merged): fails its first attempt only, as a flake does.
test("throwaway: a flake that passes on its retry", async ({ page }, testInfo) => {
  await page.goto("/");
  expect(testInfo.retry, "first attempt fails").toBeGreaterThan(0);
});
