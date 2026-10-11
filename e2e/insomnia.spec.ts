import { readFile, readdir } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { dumpIdb, openFolder, send } from "./support/app";

// P4.4: an Insomnia export, format 4 (JSON) or format 5 (YAML), takes the
// one road of every import. Run with CI=1 (the built app).

const pick = (page: Page, name: string, content: string) => page.locator('app-collections-sidebar input[type="file"]').setInputFiles({ name, mimeType: name.endsWith(".json") ? "application/json" : "application/yaml", buffer: Buffer.from(content) });
const dialog = (page: Page, name = "Import collection") => page.getByRole("dialog", { name, exact: true });
const stored = async (page: Page) => JSON.stringify(await dumpIdb(page));

const FORMAT_5 = `type: collection.insomnia.rest/5.0
schema_version: "5.1"
name: Shop API
meta:
  id: wrk_1
  description: From Insomnia
collection:
  - name: Admin
    meta:
      id: fld_1
    authentication:
      type: basic
      username: ada
      password: "{{ _.password }}"
    environment:
      region: eu
    children:
      - name: List
        meta:
          id: req_1
        method: GET
        url: "{{ _.base }}/echo"
        parameters:
          - name: region
            value: "{{ _.region }}"
        scripts:
          afterResponse: insomnia.test('from Insomnia', () => {});
      - name: Signed
        meta:
          id: req_2
        method: POST
        url: "{{ _.base }}/echo"
        body:
          mimeType: application/json
          text: '{"id": "{% uuid ''v4'' %}"}'
        authentication:
          type: hawk
          id: not-kept
environments:
  name: Base Environment
  meta:
    id: env_1
  data:
    base: http://127.0.0.1:4300
    password: base-secret
  subEnvironments:
    - name: Staging
      meta:
        id: env_2
      data:
        password: staging-secret
`;

test("@claim:C-059 an Insomnia format 5 file in YAML imports with a report; its folder's auth is inherited, its variables are the app's, and nothing of it runs", async ({ page }) => {
  const violations: string[] = [];
  await page.exposeFunction("reportViolation", (directive: string) => violations.push(directive));
  await page.addInitScript(() => addEventListener("securitypolicyviolation", (event) => void (window as unknown as { reportViolation: (directive: string) => void }).reportViolation(event.violatedDirective)));
  await page.goto("/");
  await expect(page.locator("input.address-url")).toBeVisible();
  const before = await stored(page);

  await pick(page, "shop.yaml", FORMAT_5);
  const report = dialog(page);
  await expect(report.locator(".import-report")).toContainText("Insomnia export");
  await expect(report.locator(".import-report")).toContainText('"shop.yaml" will add 1 collection, 1 folder, 2 requests and 1 environment.');
  await expect(report.locator(".import-warnings")).toContainText('request "List". Its after-response script is left out: an Insomnia script calls Insomnia\'s own "insomnia" object, which the app does not have.');
  await expect(report.locator(".import-warnings")).toContainText("request \"Signed\". It uses a template of Insomnia's ({% uuid 'v4' %}), which the app does not have: the text is kept as written.");
  await expect(report.locator(".import-warnings")).toContainText('request "Signed". Its auth is of a type the app does not have (hawk) and is left out: it is sent with no auth.');
  expect(await stored(page)).toBe(before);

  await report.getByRole("button", { name: "Confirm import" }).click();
  await expect(report).toHaveCount(0);
  const after = await dumpIdb(page);
  expect(after["collections"]).toMatchObject([
    { name: "Shop API", description: "From Insomnia", auth: { type: "none" }, scripts: { pre: "", post: "" }, scriptTrust: { trusted: false }, variables: [{ key: "base", value: "http://127.0.0.1:4300", enabled: true }, { key: "password", value: "base-secret", enabled: true }] },
  ]);
  expect(after["folders"]).toMatchObject([{ name: "Admin", auth: { type: "basic", username: "ada", password: "{{password}}" }, variables: [{ key: "region", value: "eu", enabled: true }] }]);
  const requests = after["requests"] as { name: string }[];
  expect(requests.find((doc) => doc.name === "List")).toMatchObject({ url: "{{base}}/echo?region={{region}}", auth: { type: "inherit" }, scripts: { pre: "", post: "" } });
  expect(requests.find((doc) => doc.name === "Signed")).toMatchObject({ auth: { type: "none" }, body: { mode: "raw", raw: { language: "json", text: `{"id": "{% uuid 'v4' %}"}` } } });
  expect(after["environments"]).toMatchObject([{ name: "Staging", vars: [{ key: "password", value: "staging-secret", enabled: true }] }]);
  expect(JSON.stringify(after)).not.toContain("not-kept");

  // The request that inherits is sent with the folder's auth, and with the variables of the collection, the folder and the environment.
  await page.getByRole("tree").getByText("Shop API", { exact: true }).click();
  await page.keyboard.press("ArrowRight");
  await openFolder(page, "Admin");
  await page.getByText("List", { exact: true }).dblclick();
  await expect(page.locator("input.address-url")).toHaveValue("{{base}}/echo?region={{region}}");
  const [sent] = await Promise.all([page.waitForRequest((candidate) => candidate.url() === "http://127.0.0.1:4300/echo?region=eu" && candidate.method() === "GET"), send(page)]);
  // The first environment the app is given becomes the active one. Its password wins over the collection's, which was
  // the base environment's: what Insomnia sends with "Staging" chosen.
  expect(sent.headers()["authorization"]).toBe(`Basic ${Buffer.from("ada:staging-secret").toString("base64")}`);
  expect(violations).toEqual([]);
});

test("@claim:C-059 an Insomnia format 4 export in JSON imports: a workspace as a collection, and the environment under its base as an environment", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("input.address-url")).toBeVisible();
  const export4 = {
    _type: "export",
    __export_format: 4,
    __export_source: "insomnia.desktop.app:v2023.5.8",
    resources: [
      { _id: "req_1", _type: "request", parentId: "fld_1", name: "List", method: "GET", url: "{{ _.base }}/echo", parameters: [], headers: [{ name: "Accept", value: "application/json" }], authentication: { type: "bearer", token: "{{ _.token }}" }, body: {}, metaSortKey: 1 },
      { _id: "fld_1", _type: "request_group", parentId: "wrk_1", name: "Admin", environment: {} },
      { _id: "wrk_1", _type: "workspace", parentId: null, name: "Shop API", scope: "collection" },
      { _id: "env_1", _type: "environment", parentId: "wrk_1", name: "Base Environment", data: { base: "http://127.0.0.1:4300" } },
      { _id: "env_2", _type: "environment", parentId: "env_1", name: "Staging", data: { token: "t-1" } },
      { _id: "jar_1", _type: "cookie_jar", parentId: "wrk_1", name: "Default Jar", cookies: [] },
    ],
  };
  await pick(page, "Insomnia_2026-10-11.json", JSON.stringify(export4));
  const report = dialog(page);
  await expect(report.locator(".import-report")).toContainText("Insomnia export");
  await expect(report.locator(".import-report")).toContainText("will add 1 collection, 1 folder, 1 request and 1 environment.");
  await expect(report.locator(".import-warnings")).toHaveCount(0);
  await report.getByRole("button", { name: "Confirm import" }).click();
  await expect(report).toHaveCount(0);

  const after = await dumpIdb(page);
  expect(after["collections"]).toMatchObject([{ name: "Shop API", variables: [{ key: "base", value: "http://127.0.0.1:4300", enabled: true }], scriptTrust: { trusted: false } }]);
  expect(after["requests"]).toMatchObject([{ name: "List", url: "{{base}}/echo", headers: [{ key: "Accept", value: "application/json", enabled: true }], auth: { type: "bearer", token: "{{token}}" } }]);
  expect(after["environments"]).toMatchObject([{ name: "Staging", vars: [{ key: "token", value: "t-1", enabled: true }] }]);
});

test("a YAML file written to grow without end as it is read is refused with a message, and the page goes on working", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("input.address-url")).toBeVisible();
  const before = await stored(page);
  // A billion laughs: nine levels, each nine of the one before. Written out it is 9 to the power of 9 strings.
  const names = "abcdefghi";
  const bomb = ["a: &a [lol, lol, lol, lol, lol, lol, lol, lol, lol]", ...Array.from(names.slice(1), (name, index) => `${name}: &${name} [${Array.from({ length: 9 }, () => `*${names[index]}`).join(", ")}]`)].join("\n");

  await pick(page, "bomb.yaml", `type: collection.insomnia.rest/5.0\n${bomb}\ncollection: *i\n`);
  const refused = dialog(page, "Import");
  await expect(refused.getByRole("alert")).toContainText('Unable to import "bomb.yaml"');
  await expect(refused.getByRole("alert")).toContainText("The YAML file repeats parts of itself through aliases 100 times or more and is refused: a file written that way grows without end as it is read.");
  await expect(refused.getByRole("button", { name: "Confirm import" })).toBeDisabled();
  await refused.getByRole("button", { name: "Cancel import" }).click();
  await expect(refused).toHaveCount(0);
  expect(await stored(page)).toBe(before);

  // The page answers: the address field takes text, and the next file imports.
  await page.locator("input.address-url").fill("https://api.example.test/after");
  await expect(page.locator("input.address-url")).toHaveValue("https://api.example.test/after");
  await pick(page, "shop.yaml", FORMAT_5);
  await expect(dialog(page).locator(".import-report")).toContainText("will add 1 collection");
});

test("a YAML file over 1 MB is refused before the reader sees it", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("input.address-url")).toBeVisible();
  await pick(page, "dense.yaml", "[".repeat(1024 * 1024 + 1));
  await expect(dialog(page, "Import").getByRole("alert")).toContainText("at more than 1 MB it is too large to be read as YAML");
});

test("the YAML reader is not in the page the server sends, and its licence ships with the app", async () => {
  const dist = "dist/wayfarer/browser";
  const index = await readFile(`${dist}/index.html`, "utf8");
  const initial = [...index.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map((match) => match[1]);
  expect(initial.length).toBeGreaterThan(0);
  // The reader says the first, the importer the second; nothing the page loads at the start holds either.
  const markers = ["Excessive alias count", "repeats parts of itself through aliases"];
  for (const name of initial) {
    const text = await readFile(`${dist}/${name}`, "utf8");
    for (const marker of markers) expect(text, name).not.toContain(marker);
  }
  const holders = [];
  for (const name of (await readdir(dist)).filter((entry) => entry.endsWith(".js"))) {
    const text = await readFile(`${dist}/${name}`, "utf8");
    if (markers.every((marker) => text.includes(marker))) holders.push(name);
  }
  expect(holders).toHaveLength(1);
  expect(holders[0]).toMatch(/^worker-[A-Z0-9]{8}\.js$/);

  const licences = await readFile(`${dist}/3rdpartylicenses.txt`, "utf8");
  expect(licences).toMatch(/^Package: yaml$/m);
  expect(licences).toContain("Copyright Eemeli Aro");
});
