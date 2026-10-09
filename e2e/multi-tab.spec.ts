import { test, expect, type Page } from "@playwright/test";
import { dumpIdb } from "./support/app";
import { ECHO } from "./support/echo";

// P2.10 (F37, #94): two tabs of the app share one database. A write in one
// is shown in the other, and neither overwrites what the other just saved.

async function createEnvironment(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "New environment" }).click();
  await page.locator("#new-env-name-input").fill(name);
  await page.getByRole("button", { name: "Create environment" }).click();
  await expect(page.locator("app-environments-manager").getByText(name, { exact: true })).toBeVisible();
}

async function addVariable(page: Page, key: string, value: string): Promise<void> {
  // The new row is drawn a frame after the click: without the wait, "last" is still the row before it.
  const keys = page.locator("input[placeholder='KEY']");
  const before = await keys.count();
  await page.getByRole("button", { name: "Add variable" }).click();
  await expect(keys).toHaveCount(before + 1);
  await keys.last().fill(key);
  await page.locator("input[placeholder='Value']").last().fill(value);
}

test("what one tab saves appears in the other within a second: a collection, an environment, a sent request", async ({ context }) => {
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  await pageA.goto("/");
  await pageB.goto("/");
  await expect(pageB.getByText("No collections yet", { exact: false })).toBeVisible();

  await pageA.getByRole("button", { name: "New collection" }).click();
  await pageA.locator("#creation-name-input").fill("Made in tab A");
  await pageA.getByRole("button", { name: "Create", exact: true }).click();
  await expect(pageB.getByText("Made in tab A", { exact: true })).toBeVisible({ timeout: 1000 });

  await createEnvironment(pageA, "Shared env");
  await expect(pageB.locator("app-environments-manager").getByText("Shared env", { exact: true })).toBeVisible({ timeout: 1000 });

  await pageA.locator("input.address-url").fill(`${ECHO}/echo?from=a`);
  await pageA.getByRole("button", { name: "Send request" }).click();
  await expect(pageA.locator(".status-badge")).toHaveText("200");
  await pageB.getByRole("button", { name: "Request history" }).click();
  await expect(pageB.getByText(`${ECHO}/echo?from=a`).first()).toBeVisible({ timeout: 1000 });
});

test("two tabs save different variables of one environment at the same moment, and both are kept", async ({ context }) => {
  const pageA = await context.newPage();
  const pageB = await context.newPage();
  await pageA.goto("/");
  await createEnvironment(pageA, "Shared env");
  await addVariable(pageA, "base", "kept");
  await pageA.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(async () => JSON.stringify((await dumpIdb(pageA))["environments"])).toContain("kept");

  // Tab B opens the environment as it is now; then each tab adds its own variable.
  await pageB.goto("/");
  await expect(pageB.locator("input[placeholder='KEY']")).toHaveValue("base");
  await addVariable(pageA, "fromA", "1");
  await addVariable(pageB, "fromB", "2");

  // Both saves are started before either is awaited: they land within a few milliseconds of each other.
  await Promise.all([
    pageA.getByRole("button", { name: "Save changes" }).click(),
    pageB.getByRole("button", { name: "Save changes" }).click(),
  ]);

  const stored = async () => {
    const [environment] = (await dumpIdb(pageA))["environments"] as { vars: { key: string; value: string }[] }[];
    return environment.vars.map((row) => `${row.key}=${row.value}`).sort();
  };
  await expect.poll(stored).toEqual(["base=kept", "fromA=1", "fromB=2"]);
  // Each tab shows the other's variable without a reload.
  for (const page of [pageA, pageB]) {
    await expect(page.locator("input[placeholder='KEY']")).toHaveCount(3);
  }
});
