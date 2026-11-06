import { expect, test, type Page } from "@playwright/test";
import { seedAndOpen } from "./support/app";

const TOKEN = "typed-bearer-7Hq2";

/** A collection with a typed Bearer token and a pre-request script, and its Share dialog open. */
async function share(page: Page) {
  await seedAndOpen(
    page,
    {},
    {
      method: "GET",
      url: "https://api.shop.example.com/orders",
      auth: { type: "bearer", token: TOKEN },
      preRequestScript: "pm.variables.set('x', '1')",
    },
  );
  await page.getByRole("tree").getByText("Tripwire collection", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Share…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Share Tripwire collection" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function saved(page: Page, click: () => Promise<void>): Promise<string> {
  const [download] = await Promise.all([page.waitForEvent("download"), click()]);
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  expect(download.suggestedFilename()).toBe("tripwire-collection.wayfarer.json");
  return Buffer.concat(chunks).toString("utf8");
}

test.describe("Share… (T1.2)", () => {
  test("a file says its name first, masks a typed credential, and holds it only with Include credentials", async ({
    page,
  }) => {
    const dialog = await share(page);
    await expect(dialog).toContainText("Saves tripwire-collection.wayfarer.json to your downloads.");
    await expect(dialog).toContainText("1 credential typed into auth is written as ***");
    await expect(dialog).toContainText("1 script goes with it.");
    const masked = await saved(page, () => dialog.getByRole("button", { name: "Save file" }).click());
    expect(masked).toContain('"$id": "wayfarer/collection"');
    expect(masked).not.toContain(TOKEN);
    await expect(dialog).toContainText("Saved tripwire-collection.wayfarer.json.");

    await dialog.getByRole("checkbox", { name: "Include credentials" }).check();
    const plain = await saved(page, () => dialog.getByRole("button", { name: "Save file" }).click());
    expect(plain).toContain(TOKEN);
  });

  test("a link says its length before Make link, then gives the link and a separate code", async ({ page }) => {
    const dialog = await share(page);
    await dialog.getByRole("radio", { name: "Link" }).check();
    await expect(dialog).toContainText(/The link is \d+ kB\./);
    await dialog.getByRole("button", { name: "Make link" }).click();
    const link = dialog.getByRole("textbox", { name: "Link", exact: true });
    const address = await link.inputValue();
    expect(new URL(address).pathname).toBe("/app/");
    expect(address).toMatch(/#share=[\w-]+$/);
    const code = await dialog.getByRole("textbox", { name: "Code", exact: true }).inputValue();
    expect(code.replace(/ /g, "")).toMatch(/^[\w-]{43}$/);
    expect(address).not.toContain(code.replace(/ /g, ""));

    await dialog.getByRole("checkbox", { name: "Put the code in the link" }).check();
    await expect(link).toHaveValue(/#share=[\w-]+&key=[\w-]{43}$/);
    await expect(dialog.getByRole("textbox", { name: "Code", exact: true })).toHaveCount(0);
  });
});
