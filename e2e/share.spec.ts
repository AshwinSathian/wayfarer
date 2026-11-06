import { expect, test, type Page } from "@playwright/test";
import { importMenu, openPalette, seedAndOpen } from "./support/app";

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

/** Makes a link of the seeded collection and gives back its address and its code. */
async function makeLink(page: Page, codeInLink = false): Promise<{ address: string; code: string }> {
  const dialog = await share(page);
  await dialog.getByRole("radio", { name: "Link" }).check();
  await dialog.getByRole("button", { name: "Make link" }).click();
  const code = (await dialog.getByRole("textbox", { name: "Code", exact: true }).inputValue()).replace(/ /g, "");
  const link = dialog.getByRole("textbox", { name: "Link", exact: true });
  if (codeInLink) {
    await dialog.getByRole("checkbox", { name: "Put the code in the link" }).check();
    await expect(link).toHaveValue(/&key=/);
  }
  const address = await link.inputValue();
  return { address, code };
}

test.describe("Receive a link (T1.3)", () => {
  test("takes the fragment off the address, asks for the code, reports the hosts, and stores nothing before Import", async ({
    page,
    browser,
  }) => {
    const { address, code } = await makeLink(page);
    const receiver = await (await browser.newContext()).newPage();
    await receiver.goto(address);
    const dialog = receiver.getByRole("dialog", { name: "Open a shared collection" });
    await expect(dialog).toBeVisible();
    expect(await receiver.evaluate(() => location.hash)).toBe("");
    expect(receiver.url()).not.toContain("#");

    const field = dialog.getByRole("textbox", { name: "Code" });
    await expect(field).toBeFocused();
    await field.fill(`${code.slice(0, -2)}AA`);
    await dialog.getByRole("button", { name: "Open", exact: true }).click();
    await expect(dialog.locator("#import-link-code-error")).toHaveText(
      "This code does not open the link. Check it with the person who sent it.",
    );

    // The code as shown, in fours, opens it.
    await field.fill(code.replace(/(.{4})/g, "$1 "));
    await field.press("Enter");
    const report = receiver.getByRole("dialog", { name: "Import collection" });
    await expect(report).toContainText('"the shared link" will add 1 collection and 1 request.');
    await expect(report.getByRole("list", { name: "Hosts its requests go to" })).toHaveText("api.shop.example.com");
    await report.getByRole("button", { name: "Cancel" }).click();
    await expect(report).toBeHidden();
    await expect(receiver.getByRole("tree").getByText("Tripwire collection", { exact: true })).toHaveCount(0);

    // Opened again, Import stores it, its scripts held and its credential masked.
    await receiver.goto(address);
    await dialog.getByRole("textbox", { name: "Code" }).fill(code);
    await dialog.getByRole("button", { name: "Open", exact: true }).click();
    await report.getByRole("button", { name: "Import", exact: true }).click();
    await expect(receiver.getByRole("tree").getByText("Tripwire collection", { exact: true })).toBeVisible();
    const stored = await receiver.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open("wayfarer");
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      const all = (name: string) =>
        new Promise<unknown[]>((resolve) => {
          const request = db.transaction(name).objectStore(name).getAll();
          request.onsuccess = () => resolve(request.result);
        });
      const out = { collections: await all("collections"), requests: await all("requests") };
      db.close();
      return out;
    });
    expect(stored.collections).toEqual([expect.objectContaining({ scriptTrust: { trusted: false } })]);
    expect(JSON.stringify(stored.requests)).not.toContain(TOKEN);
    await receiver.context().close();
  });

  test("a link with its code in it opens at once; a damaged one is refused with its reason", async ({
    page,
    browser,
  }) => {
    const { address } = await makeLink(page, true);
    const receiver = await (await browser.newContext()).newPage();
    await receiver.goto(address);
    await expect(receiver.getByRole("dialog", { name: "Import collection" })).toContainText(
      '"the shared link" will add 1 collection and 1 request.',
    );
    expect(await receiver.evaluate(() => location.hash)).toBe("");

    // Pasted into the open app's address bar: a navigation inside the page, taken the same way.
    await receiver.getByRole("dialog", { name: "Import collection" }).getByRole("button", { name: "Cancel" }).click();
    const damaged = address.replace(
      /#share=(.{10})(.)/,
      (_, kept: string, byte: string) => `#share=${kept}${byte === "A" ? "B" : "A"}`,
    );
    await receiver.evaluate((hash) => (location.hash = hash), new URL(damaged).hash);
    const refused = receiver.getByRole("dialog", { name: "Import", exact: true });
    await expect(refused).toContainText("This link is incomplete");
    expect(await receiver.evaluate(() => location.hash)).toBe("");
    await receiver.context().close();
  });
});

test.describe("Paste a link (receive.md, Entry points)", () => {
  /** Pastes `text` into the open link box and opens it; the page goes nowhere and asks for nothing. */
  async function paste(receiver: Page, text: string, code: string): Promise<void> {
    const at = receiver.url();
    const asked: string[] = [];
    receiver.on("request", (request) => asked.push(request.url()));
    const box = receiver.getByRole("dialog", { name: "Open a shared collection" });
    const field = box.getByRole("textbox", { name: "A link someone sent you" });
    await expect(field).toBeFocused();
    await field.fill(text);
    await box.getByRole("button", { name: "Open", exact: true }).click();
    await box.getByRole("textbox", { name: "Code" }).fill(code);
    await box.getByRole("button", { name: "Open", exact: true }).click();
    const report = receiver.getByRole("dialog", { name: "Import collection" });
    await expect(report).toContainText('"the shared link" will add 1 collection and 1 request.');
    expect(receiver.url()).toBe(at);
    expect(asked.filter((url) => url.includes("#share=") || url.startsWith("https://elsewhere.example"))).toEqual([]);
    await report.getByRole("button", { name: "Cancel" }).click();
    await expect(report).toBeHidden();
  }

  test("Import, Link… reads a whole address of any origin; the palette's Open a shared link… a bare fragment", async ({
    page,
    browser,
  }) => {
    const { address, code } = await makeLink(page);
    const fragment = new URL(address).hash;

    const receiver = await (await browser.newContext()).newPage();
    await seedAndOpen(receiver, {}, { method: "GET", url: "https://api.example.com/" });
    await importMenu(receiver, "Link…");
    // Another origin's address, as a document might hold it, with the white space a copy brings.
    await paste(receiver, `  https://elsewhere.example/app/?from=doc${fragment}\n`, code);

    await (await openPalette(receiver)).fill("open a shared link");
    await receiver.keyboard.press("Enter");
    await paste(receiver, fragment, code);
    await receiver.context().close();
  });

  test("text that is not a link is refused, and the page stays where it was", async ({ page }) => {
    await seedAndOpen(page, {}, { method: "GET", url: "https://api.example.com/" });
    const at = page.url();
    await importMenu(page, "Link…");
    const box = page.getByRole("dialog", { name: "Open a shared collection" });
    await box.getByRole("textbox", { name: "A link someone sent you" }).fill("https://elsewhere.example/app/");
    await box.getByRole("button", { name: "Open", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Import", exact: true })).toContainText(
      "This link does not hold a Wayfarer collection.",
    );
    expect(page.url()).toBe(at);
  });
});
