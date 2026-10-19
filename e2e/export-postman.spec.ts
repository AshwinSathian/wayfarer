import { readFile, readdir } from "node:fs/promises";
import { expect, test, type Download, type Page } from "@playwright/test";
import { openEnvironments, protectVariable, seedAndOpen } from "./support/app";
import { ECHO } from "./support/echo";

// P4.6 (b): a collection and an environment as Postman files. That Newman
// runs the exported collection and gives the results the app's engine gives
// is held in packages/core/test/export/postman.test.ts; here, that the app
// writes the file, masks it, and says first what the format cannot hold.

const SECRET = "c057-secret-plaintext";

async function json(download: Download): Promise<Record<string, any>> { // eslint-disable-line @typescript-eslint/no-explicit-any -- read as Postman reads it: by its keys.
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

async function exportForPostman(page: Page, credentials = false): Promise<Download> {
  await page.getByText("Tripwire collection", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Export for Postman…" }).click();
  const dialog = page.getByRole("dialog", { name: "Export for Postman" });
  await expect(dialog).toBeVisible();
  if (credentials) await dialog.getByRole("checkbox", { name: "Include credentials" }).check();
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Export file" }).click()]);
  await expect(dialog).toBeHidden();
  return download;
}

test("@claim:C-057 a collection exports as a Postman Collection v2.1 file: auth and scripts at each level, credentials masked unless asked for, and what Postman has no place for said first", async ({ page }) => {
  await seedAndOpen(page, {}, {
    method: "POST",
    url: `${ECHO}/echo?a=1`,
    headers: { "X-Trace": "t-1" },
    storedBody: { mode: "urlencoded", urlencoded: [{ key: "q", value: "a b", enabled: true }, { key: "off", value: "1", enabled: false }] },
    auth: { type: "inherit" },
    postRequestScript: "pm.test('request', () => {});",
    tests: [{ id: "t-1", target: "status", operator: "equals", expected: "200" }],
    collection: { auth: { type: "bearer", token: "c057-token-value" }, scripts: { pre: "// collection\nconst a = 1;", post: "" }, variables: { greeting: "hello" } },
    folder: { auth: { type: "basic", username: "admin", password: "c057-password" }, scripts: { pre: "", post: "// folder" } },
  });

  // The dialog says what the file will not hold, before anything is written.
  await page.getByText("Tripwire collection", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Export for Postman…" }).click();
  const dialog = page.getByRole("dialog", { name: "Export for Postman" });
  await expect(dialog.getByRole("status")).toContainText("1 thing Postman's format has no place for");
  await expect(dialog.getByRole("status")).toContainText('request "Tripwire request". Its assertion is left out: Postman has tests only as scripts.');
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  const download = await exportForPostman(page);
  expect(download.suggestedFilename()).toBe("tripwire-collection.postman_collection.json");
  const file = await json(download);
  expect(file["info"]).toEqual({ _postman_id: "col-tw", name: "Tripwire collection", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" });
  expect(file["variable"]).toEqual([{ key: "greeting", value: "hello", type: "string" }]);
  // Masked, as the app's own file is (C-014).
  expect(file["auth"]).toEqual({ type: "bearer", bearer: [{ key: "token", value: "***", type: "string" }] });
  expect(file["event"]).toEqual([{ listen: "prerequest", script: { type: "text/javascript", exec: ["// collection", "const a = 1;"] } }]);
  const [folder] = file["item"];
  expect(folder.name).toBe("Tripwire folder");
  expect(folder.auth).toEqual({ type: "basic", basic: [{ key: "username", value: "admin", type: "string" }, { key: "password", value: "***", type: "string" }] });
  expect(folder.event).toEqual([{ listen: "test", script: { type: "text/javascript", exec: ["// folder"] } }]);
  const [item] = folder.item;
  expect(item.name).toBe("Tripwire request");
  expect(item.event).toEqual([{ listen: "test", script: { type: "text/javascript", exec: ["pm.test('request', () => {});"] } }]);
  // A request that inherits has no auth of its own in the file: that is how Postman says "inherit".
  expect(item.request).toEqual({
    method: "POST",
    header: [{ key: "X-Trace", value: "t-1" }],
    body: { mode: "urlencoded", urlencoded: [{ key: "q", value: "a b", type: "text" }, { key: "off", value: "1", type: "text", disabled: true }] },
    url: { raw: `${ECHO}/echo?a=1`, protocol: "http", host: ["127", "0", "0", "1"], port: "4300", path: ["echo"], query: [{ key: "a", value: "1" }] },
  });
  expect(JSON.stringify(file)).not.toMatch(/c057-token-value|c057-password/);

  const whole = await json(await exportForPostman(page, true));
  expect(whole["auth"].bearer[0].value).toBe("c057-token-value");
  expect(whole["item"][0].auth.basic[1].value).toBe("c057-password");
});

test("@claim:C-057 an environment exports as a Postman environment file: one environment, a protected variable of type secret with no value unless asked", async ({ page }) => {
  await seedAndOpen(page, { host: "localhost" }, { method: "GET", url: `${ECHO}/echo` });
  await protectVariable(page, "API_TOKEN", SECRET);
  await openEnvironments(page);
  await page.getByRole("button", { name: "Export environments" }).click();
  const dialog = page.getByRole("dialog", { name: "Export environments" });
  await dialog.getByRole("radio", { name: "With the vault" }).click();
  await dialog.getByRole("radio", { name: "Postman" }).click();
  // A Postman file has no place for the vault: the choice is gone, and what was chosen falls back to leaving the value out.
  await expect(dialog.getByRole("radio", { name: "With the vault" })).toHaveCount(0);
  await expect(dialog.getByRole("radio", { name: "Leave out" })).toBeChecked();
  await expect(dialog.getByRole("combobox", { name: "Environment" })).toContainText("Tripwire env");

  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Export file" }).click()]);
  expect(download.suggestedFilename()).toBe("tripwire-env.postman_environment.json");
  expect(await json(download)).toEqual({
    id: "env-tw",
    name: "Tripwire env",
    values: [
      { key: "host", value: "localhost", type: "default", enabled: true },
      { key: "API_TOKEN", value: "", type: "secret", enabled: true },
    ],
    _postman_variable_scope: "environment",
  });

  // Plain text, with the words typed as for the app's own file (C-047).
  await page.getByRole("button", { name: "Export environments" }).click();
  await dialog.getByRole("radio", { name: "Postman" }).click();
  await dialog.getByRole("radio", { name: "Plain text" }).click();
  await dialog.getByLabel(/to confirm/).fill("EXPORT SECRETS");
  const [plain] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Export file" }).click()]);
  expect((await json(plain))["values"][1]).toEqual({ key: "API_TOKEN", value: SECRET, type: "secret", enabled: true });
});

test("the Postman exporter is not in the page the server sends, and is fetched when a Postman file is first asked for", async ({ page }) => {
  // The exporter says this sentence, and exactly one file of the build holds it: one that index.html does not name.
  const dist = "dist/wayfarer/browser";
  const marker = "Postman has tests only as scripts";
  const holders: string[] = [];
  for (const name of (await readdir(dist)).filter((entry) => entry.endsWith(".js"))) {
    if ((await readFile(`${dist}/${name}`, "utf8")).includes(marker)) holders.push(name);
  }
  expect(holders).toHaveLength(1);
  expect(await readFile(`${dist}/index.html`, "utf8")).not.toContain(holders[0]);

  const scripts: string[] = [];
  page.on("request", (sent) => scripts.push(new URL(sent.url()).pathname.replace(/^\/app\//, "")));
  await seedAndOpen(page, {}, { method: "GET", url: `${ECHO}/echo` });
  expect(scripts).not.toContain(holders[0]);
  await exportForPostman(page);
  expect(scripts.filter((path) => path === holders[0])).toHaveLength(1);
});
