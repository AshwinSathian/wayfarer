import { readFile, readdir } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { dumpIdb, openFolder, send } from "./support/app";

// P4.3: an OpenAPI 3.0 or 3.1 description, or a Swagger 2.0 one, takes the
// one road of every import, and nothing is fetched for it. Run with CI=1
// (the built app).

const pick = (page: Page, name: string, content: string) => page.locator('app-collections-sidebar input[type="file"]').setInputFiles({ name, mimeType: name.endsWith(".json") ? "application/json" : "application/yaml", buffer: Buffer.from(content) });
const dialog = (page: Page, name = "Import collection") => page.getByRole("dialog", { name, exact: true });
const stored = async (page: Page) => JSON.stringify(await dumpIdb(page));

// Its references to an address name a server that is running: a fetch of one would be answered, and seen.
const OPENAPI_31 = `openapi: 3.1.0
info:
  title: Pet shop
  description: From a description
  version: 1.0.0
servers:
  - url: http://127.0.0.1:4300/
tags:
  - name: pets
    description: Everything about pets
paths:
  /echo:
    post:
      tags: [pets]
      summary: Add a pet
      parameters:
        - name: limit
          in: query
          schema: { type: integer }
          example: 20
        - $ref: 'http://127.0.0.1:4300/echo?fetched=parameter#/limit'
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Pet'
      responses:
        '200': { description: OK }
  /pets/{petId}:
    get:
      tags: [pets]
      operationId: getPet
      security:
        - shop_auth: [read]
      responses:
        '200': { description: OK }
components:
  securitySchemes:
    shop_auth:
      type: oauth2
      flows: {}
  schemas:
    Pet:
      type: object
      properties:
        name: { type: string, example: Rex }
        parent: { $ref: '#/components/schemas/Pet' }
        owner: { $ref: 'http://127.0.0.1:4300/echo?fetched=schema' }
`;

test("@claim:C-060 @claim:C-001 an OpenAPI 3.1 description in YAML imports with a report: a request per operation in a folder per tag, and nothing is fetched for a reference to an address", async ({ page, context, baseURL }) => {
  const violations: string[] = [];
  await page.exposeFunction("reportViolation", (directive: string) => violations.push(directive));
  await page.addInitScript(() => addEventListener("securitypolicyviolation", (event) => void (window as unknown as { reportViolation: (directive: string) => void }).reportViolation(event.violatedDirective)));
  const appOrigin = new URL(baseURL ?? "http://localhost:4200").origin;
  const elsewhere: string[] = [];
  // Context-level, so a request the import worker or the service worker made would be seen too.
  context.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith("data:") && !url.startsWith("blob:") && new URL(url).origin !== appOrigin) elsewhere.push(`${request.method()} ${url}`);
  });
  await page.goto("/app/");
  await expect(page.locator("input.address-url")).toBeVisible();
  const before = await stored(page);

  await pick(page, "shop.yaml", OPENAPI_31);
  const report = dialog(page);
  await expect(report.locator(".import-report")).toContainText("OpenAPI description");
  await expect(report.locator(".import-report")).toContainText('"shop.yaml" will add 1 collection, 1 folder and 2 requests.');
  await expect(report.locator(".import-warnings")).toContainText('request "Add a pet". It refers to 2 other files or addresses (http://127.0.0.1:4300/echo?fetched=parameter#/limit, http://127.0.0.1:4300/echo?fetched=schema). An import fetches nothing: what they describe is left out.');
  await expect(report.locator(".import-warnings")).toContainText('request "getPet". Its auth is OAuth 2.0 with a grant the app does not have (none said) and is left out: it is sent with no auth.');
  expect(await stored(page)).toBe(before);

  await report.getByRole("button", { name: "Confirm import" }).click();
  await expect(report).toHaveCount(0);
  const after = await dumpIdb(page);
  expect(after["collections"]).toMatchObject([{ name: "Pet shop", description: "From a description", auth: { type: "none" }, scripts: { pre: "", post: "" }, scriptTrust: { trusted: false }, variables: [{ key: "baseUrl", value: "http://127.0.0.1:4300", enabled: true }] }]);
  expect(after["folders"]).toMatchObject([{ name: "pets", description: "Everything about pets", auth: { type: "inherit" } }]);
  const requests = after["requests"] as { name: string }[];
  // The schema that holds itself ends there, and what the address would have described is not there.
  const body = '{\n  "name": "Rex",\n  "parent": null,\n  "owner": null\n}';
  expect(requests.find((doc) => doc.name === "Add a pet")).toMatchObject({ method: "POST", url: "{{baseUrl}}/echo?limit=20", auth: { type: "inherit" }, body: { mode: "raw", raw: { language: "json", text: body } } });
  expect(requests.find((doc) => doc.name === "getPet")).toMatchObject({ method: "GET", url: "{{baseUrl}}/pets/{{petId}}", auth: { type: "none" } });
  // Read, reported and stored: and not one request left the app.
  expect(elsewhere).toEqual([]);

  // The request is sent to the server the file names, with the body written from its schema.
  await page.getByRole("tree").getByText("Pet shop", { exact: true }).click();
  await page.keyboard.press("ArrowRight");
  await openFolder(page, "pets");
  await page.getByText("Add a pet", { exact: true }).dblclick();
  await expect(page.locator("input.address-url")).toHaveValue("{{baseUrl}}/echo?limit=20");
  const [sent] = await Promise.all([page.waitForRequest((candidate) => candidate.url() === "http://127.0.0.1:4300/echo?limit=20" && candidate.method() === "POST"), send(page)]);
  expect(sent.postData()).toBe(body);
  expect(sent.headers()["content-type"]).toBe("application/json");
  expect(elsewhere.filter((line) => !line.startsWith("OPTIONS "))).toEqual(["POST http://127.0.0.1:4300/echo?limit=20"]);
  expect(violations).toEqual([]);
});

test("@claim:C-060 a Swagger 2.0 description in JSON imports: its host as the collection's variable, its form as a form, its API key as the collection's auth", async ({ page }) => {
  await page.goto("/app/");
  await expect(page.locator("input.address-url")).toBeVisible();
  const swagger = {
    swagger: "2.0",
    info: { title: "Old shop", version: "1" },
    host: "127.0.0.1:4300",
    basePath: "/v2",
    schemes: ["http"],
    security: [{ key: [] }],
    securityDefinitions: { key: { type: "apiKey", in: "header", name: "X-API-Key" } },
    paths: {
      "/pets/{id}": {
        post: { summary: "Rename", consumes: ["application/x-www-form-urlencoded"], parameters: [{ name: "id", in: "path", required: true, type: "integer" }, { name: "name", in: "formData", type: "string", default: "Rex" }], responses: { 200: { description: "OK" } } },
        delete: { security: [], responses: { 204: { description: "Gone" } } },
      },
    },
  };
  await pick(page, "swagger.json", JSON.stringify(swagger));
  const report = dialog(page);
  await expect(report.locator(".import-report")).toContainText("OpenAPI description");
  await expect(report.locator(".import-report")).toContainText("will add 1 collection and 2 requests.");
  await expect(report.locator(".import-warnings")).toHaveCount(0);
  await report.getByRole("button", { name: "Confirm import" }).click();
  await expect(report).toHaveCount(0);

  const after = await dumpIdb(page);
  expect(after["collections"]).toMatchObject([{ name: "Old shop", auth: { type: "apikey", key: "X-API-Key", value: "{{apiKey}}", in: "header" }, variables: [{ key: "baseUrl", value: "http://127.0.0.1:4300/v2", enabled: true }], scriptTrust: { trusted: false } }]);
  // The store gives its requests by id, which is random: each is found by its name.
  const requests = after["requests"] as { name: string }[];
  expect(requests).toHaveLength(2);
  expect(requests.find((doc) => doc.name === "Rename")).toMatchObject({ method: "POST", url: "{{baseUrl}}/pets/{{id}}", auth: { type: "inherit" }, body: { mode: "urlencoded", urlencoded: [{ key: "name", value: "Rex", enabled: true }] } });
  expect(requests.find((doc) => doc.name === "DELETE /pets/{id}")).toMatchObject({ method: "DELETE", url: "{{baseUrl}}/pets/{{id}}", auth: { type: "none" } });
});

test("a description of a version the app does not read, and one with no operation, are refused with a message, and nothing is stored", async ({ page }) => {
  await page.goto("/app/");
  await expect(page.locator("input.address-url")).toBeVisible();
  const before = await stored(page);
  for (const [name, content, message] of [
    ["old.json", JSON.stringify({ swagger: "1.2", apis: [] }), "This is a Swagger description of version 1.2, which Wayfarer does not read. It reads OpenAPI 3.0 and 3.1 and Swagger 2.0."],
    ["hooks.yaml", "openapi: 3.1.0\ninfo:\n  title: Hooks\nwebhooks: {}\n", "This OpenAPI file describes no operation under `paths`, so there is no request to import."],
  ]) {
    await pick(page, name, content);
    const refused = dialog(page, "Import");
    await expect(refused.getByRole("alert")).toContainText(`Unable to import "${name}"`);
    await expect(refused.getByRole("alert")).toContainText(message);
    await refused.getByRole("button", { name: "Cancel import" }).click();
    await expect(refused).toHaveCount(0);
  }
  expect(await stored(page)).toBe(before);
});

test("the OpenAPI importer is not in the page the server sends: it is in the import worker, and brings no library", async () => {
  const dist = "dist/wayfarer/browser";
  const index = await readFile(`${dist}/index.html`, "utf8");
  const initial = [...index.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map((match) => match[1]);
  expect(initial.length).toBeGreaterThan(0);
  // The importer says this, and nothing the page loads at the start holds it.
  const marker = "describes no operation under";
  for (const name of initial) expect(await readFile(`${dist}/${name}`, "utf8"), name).not.toContain(marker);
  const holders = [];
  for (const name of (await readdir(dist)).filter((entry) => entry.endsWith(".js"))) {
    if ((await readFile(`${dist}/${name}`, "utf8")).includes(marker)) holders.push(name);
  }
  expect(holders).toHaveLength(1);
  expect(holders[0]).toMatch(/^worker-[A-Z0-9]{8}\.js$/);
  // No parser came with it: the shipped licences name none.
  expect(await readFile(`${dist}/3rdpartylicenses.txt`, "utf8")).not.toMatch(/^Package: .*(openapi|swagger|scalar|ajv)/im);
});
