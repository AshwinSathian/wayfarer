import { expect, test, type Page } from "@playwright/test";
import { dumpIdb, protectVariable, seedAndOpen } from "./support/app";
import { collectionFile, shareFragmentOf } from "./support/share-link";

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

  // receive.md, Accessibility and "Done": focus in Code at open, a wrong code an alert and the field's description,
  // and after Import focus on the new collection's row with "Added {collection}." said politely.
  for (const width of [1440, 390]) {
    test(`the code step and Import are heard and keep focus where the person is, at ${width} px`, async ({
      page,
      browser,
    }) => {
      const { address, code } = await makeLink(page);
      const receiver = await (await browser.newContext()).newPage();
      await receiver.setViewportSize({ width, height: 900 });
      await receiver.goto(address);
      const dialog = receiver.getByRole("dialog", { name: "Open a shared collection" });
      const field = dialog.getByRole("textbox", { name: "Code", exact: true });
      await expect(field).toBeFocused();
      await field.fill(`${code.slice(0, -2)}AA`);
      await field.press("Enter");
      const wrong = "This code does not open the link. Check it with the person who sent it.";
      await expect(dialog.getByRole("alert")).toHaveText(wrong);
      await expect(field).toHaveAccessibleDescription(wrong);
      await expect(field).toBeFocused();

      await field.fill(code);
      await field.press("Enter");
      await receiver
        .getByRole("dialog", { name: "Import collection" })
        .getByRole("button", { name: "Import", exact: true })
        .click();
      await expect(receiver.getByRole("treeitem", { name: /Tripwire collection/ })).toBeFocused();
      await expect(receiver.getByRole("status").filter({ hasText: "Added Tripwire collection." })).toHaveCount(1);
      await receiver.context().close();
    });
  }
});

// README principle 1: a link opened over work in progress changes nothing before Import, and its Import does not
// overwrite a tab's unsaved edit, also when it replaces the very request that tab holds.
test("a link opened over an unsaved tab and an unlocked vault changes nothing before Import, and Import keeps the edit", async ({
  page,
}) => {
  await seedAndOpen(page, {}, { method: "GET", url: "https://api.here.example/mine" });
  await protectVariable(page, "token", "s3cret-value");
  const address = page.locator("input.address-url");
  const edited = "https://api.here.example/mine?edited=1";
  await address.fill(edited);
  const unsaved = page.getByRole("img", { name: "Unsaved changes" });
  await expect(unsaved).toHaveCount(1);
  const storedUrl = async () => {
    const { requests } = await dumpIdb(page);
    return (requests as { id: string; url: string }[]).find((request) => request.id === "req-tw")?.url;
  };

  // The same collection and request, as another person has them.
  const { hash } = shareFragmentOf(
    collectionFile(
      { collection: "col-tw", request: "req-tw" },
      "Tripwire collection",
      "https://api.sender.example/theirs",
    ),
  );
  await page.evaluate((fragment) => (location.hash = fragment), hash);
  const report = page.getByRole("dialog", { name: "Import collection" });
  await expect(report).toContainText('"the shared link" will add 1 collection and 1 request.');
  await expect(address).toHaveValue(edited);
  await expect(unsaved).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Vault unlocked", exact: true })).toBeVisible();
  expect(await storedUrl()).toBe("https://api.here.example/mine");

  await report.getByRole("button", { name: "Import", exact: true }).click();
  await expect(report).toHaveCount(0);
  await expect.poll(storedUrl).toBe("https://api.sender.example/theirs");
  // The tab keeps what was typed in it, and still says it is not saved.
  await expect(address).toHaveValue(edited);
  await expect(unsaved).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Vault unlocked", exact: true })).toBeVisible();
});
