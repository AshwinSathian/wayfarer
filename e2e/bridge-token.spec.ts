import { test, expect, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { PASSPHRASE, dumpIdb, openSettings, seedAndOpen, send } from "./support/app";
import { ECHO } from "./support/echo";

// F83 (#266): the Local Bridge's token was plain text in localStorage. It is a vault secret while the vault is
// unlocked, and otherwise in the tab's memory.

const TOKEN = "bridge-token-for-the-f83-e2e-0123456789";

async function switchBridgeOn(page: Page, url: string): Promise<void> {
  const settings = await openSettings(page, "Local Bridge");
  await settings
    .getByRole("radiogroup", { name: "Route" })
    .getByRole("radio", { name: "Local Bridge", exact: true })
    .click();
  await settings.locator("#bridge-url-input").fill(url);
  await settings.locator("#bridge-token-input").fill(TOKEN);
  await settings.getByRole("button", { name: "Save", exact: true }).click();
  await expect(settings.locator(".bridge-saved")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(settings).toHaveCount(0);
}

/** Everything the page keeps: both web storages and every store of the database, as text. */
async function everythingStored(page: Page): Promise<string> {
  const web = await page.evaluate(() => JSON.stringify([{ ...localStorage }, { ...sessionStorage }]));
  return web + JSON.stringify(await dumpIdb(page));
}

test("without a vault the bridge's token is stored nowhere: after a reload a send says so, and nothing is sent", async ({
  page,
}) => {
  let relayed = 0;
  await page.route("http://127.0.0.1:7799/**", (route) => {
    relayed += 1;
    return route.abort();
  });
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo` });
  await switchBridgeOn(page, "http://127.0.0.1:7799");
  expect(await everythingStored(page)).not.toContain(TOKEN);
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem("wayfarer:bridge"))) ?? "{}")).toEqual({
    route: "bridge",
    url: "http://127.0.0.1:7799",
  });

  await page.reload();
  await page.getByRole("tree").getByText("Tripwire request", { exact: true }).click();
  await expect(page.locator("input.address-url")).toHaveValue(`${ECHO}/echo`);
  await send(page);
  await expect(
    page.getByText("The Local Bridge is on, and its token is not in this tab.", { exact: false }),
  ).toBeVisible();
  expect(relayed).toBe(0);
  // The pane has no token to show either.
  const settings = await openSettings(page, "Local Bridge");
  await expect(settings.locator("#bridge-token-input")).toHaveValue("");
});

test("with the vault unlocked the token is a vault secret: after a reload a send asks for the passphrase and goes through the bridge", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "the Local Bridge is started for Chromium only (plan P4.7)");
  const port = 7750 + test.info().parallelIndex;
  const bridge = spawn(
    process.execPath,
    ["packages/bridge/bin/cli.js", "--port", String(port), "--token", TOKEN, "--allow-origin", "http://localhost:4200"],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  try {
    await new Promise<void>((resolve, reject) => {
      bridge.once("exit", (code) => reject(new Error(`the bridge exited with ${code}`)));
      bridge.stdout.on("data", (chunk: Buffer) => {
        if (String(chunk).includes("listening on")) resolve();
      });
    });
    const direct: string[] = [];
    page.on("request", (request) => {
      if (request.url().startsWith(ECHO)) direct.push(request.url());
    });
    await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo` });
    await page.getByRole("button", { name: "Vault locked", exact: true }).click();
    const create = page.getByRole("dialog", { name: "Create vault passphrase", exact: true });
    await create.locator("input[type='password']").nth(0).fill(PASSPHRASE);
    await create.locator("input[type='password']").nth(1).fill(PASSPHRASE);
    await create.getByRole("button", { name: "Create vault" }).click();
    await expect(page.getByRole("button", { name: "Vault unlocked", exact: true })).toBeVisible();

    await switchBridgeOn(page, `http://127.0.0.1:${port}`);
    await expect.poll(async () => (await dumpIdb(page))["secrets"]?.length).toBe(1);
    expect(await everythingStored(page)).not.toContain(TOKEN);

    await page.reload();
    await page.getByRole("tree").getByText("Tripwire request", { exact: true }).click();
    await expect(page.locator("input.address-url")).toHaveValue(`${ECHO}/echo`);
    await page.getByRole("button", { name: "Send request" }).click();
    const unlock = page.getByRole("dialog", { name: "Unlock secrets", exact: true });
    await unlock.locator("input[type='password']").fill(PASSPHRASE);
    await unlock.getByRole("button", { name: "Unlock secrets" }).click();
    await expect(page.locator(".status-badge")).toHaveText("200");
    expect(direct).toEqual([]);
    expect(await everythingStored(page)).not.toContain(TOKEN);
  } finally {
    bridge.kill();
  }
});
