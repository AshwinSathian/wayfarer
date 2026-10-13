import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { dumpIdb, seedAndOpen, send } from "./support/app";
import { ECHO } from "./support/echo";
import { settled } from "./support/settled";

// P5.5: a GraphQL body is a query and its variables; a schema is fetched from the request's address,
// and the query is checked against it and completed from it.

const GRAPHQL = `${ECHO}/graphql`;
const viewer = (page: Page): Locator => page.locator("app-response-viewer");
const pane = (page: Page): Locator => page.locator("app-body-panel .graphql");
const explorer = (page: Page): Locator => pane(page).getByRole("region", { name: "Schema" });
const problems = (page: Page): Locator => pane(page).getByRole("status", { name: "Problems in the query" });
const open = (page: Page, query: string, variables = "") => seedAndOpen(page, {}, { method: "POST", url: GRAPHQL, headers: { Authorization: "Bearer graphql-e2e" }, storedBody: { mode: "graphql", graphql: { query, variables } } });
/** Every `securitypolicyviolation` the page reports from now on. */
const violations = async (page: Page): Promise<() => Promise<string[]>> => {
  await page.addInitScript(() => {
    (window as unknown as { cspViolations: string[] }).cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => (window as unknown as { cspViolations: string[] }).cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`));
  });
  return () => page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations);
};

test("Fetch schema fills the schema explorer, and the query's result is shown", async ({ page }) => {
  const reported = await violations(page);
  await open(page, "query Greet($name: String) {\n  hello(name: $name)\n}", '{ "name": "Ada" }');
  await expect(pane(page).locator(".graphql-schema-status")).toContainText("Fetch the schema to have the query checked and completed.");
  await expect(explorer(page)).toHaveCount(0);

  await pane(page).getByRole("button", { name: "Fetch schema" }).click();
  await expect(pane(page).locator(".graphql-schema-status")).toContainText("The schema of this address is loaded");
  await expect(explorer(page)).toContainText("Schema: 4 types");
  const types = explorer(page).locator("summary");
  await expect(types).toHaveText(["query Query", "mutation Mutation", "enum Kind", "type Pet"]);
  // The query type is open: its fields with their arguments and types, and what the schema says of them.
  await expect(explorer(page).locator("details[open] code")).toHaveText(["hello(name: String): String!", "pet(id: ID!): Pet", "pets: [Pet!]!"]);
  await expect(explorer(page)).toContainText("Says hello to someone, or to the world.");
  await types.nth(3).click();
  await expect(explorer(page).locator("details").nth(3)).toContainText("An animal that can be adopted.");
  await expect(pane(page).getByRole("button", { name: "Refresh schema" })).toBeVisible();
  // A query the schema allows has no problem.
  await expect(problems(page)).toHaveCount(0);

  // Asking for the schema is not a send: nothing of it is in history.
  expect((await dumpIdb(page))["history"]).toEqual([]);

  await send(page);
  await expect(page.locator(".status-badge").first()).toHaveText("200");
  await expect.poll(async () => (await viewer(page).innerText()).replace(/\s+/g, "")).toContain('"hello":"Hello,Ada"');
  // It went out as one JSON object, with the request's own header.
  await expect.poll(async () => (await viewer(page).innerText()).replace(/\s+/g, "")).toContain('"authorization":"Bearergraphql-e2e"');
  expect(await reported()).toEqual([]);
});

test("a field the schema does not have is marked in the editor and named under it, once the schema is there", async ({ page }) => {
  const reported = await violations(page);
  await open(page, "{\n  nope\n}");
  // Without a schema a field cannot be wrong.
  await expect(pane(page).locator(".monaco-editor").first()).toBeVisible({ timeout: 20_000 });
  await expect(problems(page)).toHaveCount(0);

  await pane(page).getByRole("button", { name: "Fetch schema" }).click();
  await expect(problems(page).getByRole("listitem")).toHaveText(['Line 2: Cannot query field "nope" on type "Query".']);
  // The marker itself, in the editor.
  await expect(pane(page).locator(".monaco-editor").first().locator(".squiggly-error")).toHaveCount(1);
  expect(await reported()).toEqual([]);
});

test("a query that does not parse is said without any schema, and variables that are no JSON object hold the send back", async ({ page }) => {
  await open(page, "{ hello ", "[1]");
  await expect(problems(page).getByRole("listitem").first()).toContainText("Syntax Error", { timeout: 20_000 });
  await send(page);
  await expect(page.getByText("The GraphQL variables must be a JSON object.")).toBeVisible();
  await expect(page.locator(".status-badge")).toHaveCount(0);
});

test("a server that gives no schema is said so, with its reason", async ({ page }) => {
  await seedAndOpen(page, {}, { method: "POST", url: `${ECHO}/echo`, storedBody: { mode: "graphql", graphql: { query: "{ hello }", variables: "" } } });
  await pane(page).getByRole("button", { name: "Fetch schema" }).click();
  await expect(pane(page).locator(".graphql-schema-status")).toContainText("No schema: The server's answer holds no schema: it may not allow introspection.");
  await expect(explorer(page)).toHaveCount(0);
});

test("the page the server sends holds nothing of GraphQL's libraries: they come with the first schema", async ({ page, request }) => {
  const scripts: string[] = [];
  page.on("response", (response) => {
    if (/\.js(\?|$)/.test(response.url())) scripts.push(response.url());
  });
  const holds = async (urls: string[]) => (await Promise.all(urls.map(async (url) => ((await (await request.get(url)).text()).includes("IntrospectionQuery") ? url : "")))).filter(Boolean);
  await open(page, "{ hello }");
  await expect(pane(page).locator(".monaco-editor").first()).toBeVisible({ timeout: 20_000 });
  const first = [...new Set(scripts)].filter((url) => /\/main-[A-Z0-9]+\.js/.test(url));
  expect(first).toHaveLength(1);
  expect(await holds(first)).toEqual([]);

  await pane(page).getByRole("button", { name: "Fetch schema" }).click();
  await expect(explorer(page)).toBeVisible();
  expect((await holds([...new Set(scripts)])).length).toBeGreaterThan(0);
});

for (const theme of ["light", "dark"] as const) {
  test(`the GraphQL pane has no critical or serious violation in the ${theme} theme, with a schema and a problem, and is not wider than the window at four widths`, async ({ page }) => {
    test.slow();
    await page.addInitScript((value) => localStorage.setItem("wayfarer:theme", value), theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await open(page, "{\n  nope\n}");
    const scan = async (state: string) => {
      await page.mouse.move(640, 880);
      // Once the page has stopped animating: a colour half way through a fade is not the colour.
      await settled(page);
      const results = await new AxeBuilder({ page }).exclude(".monaco-editor").analyze();
      expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").flatMap((v) => v.nodes.map((node) => `${state}: ${v.id}: ${node.target.join(" ")}`))).toEqual([]);
    };
    await expect(pane(page).getByRole("button", { name: "Fetch schema" })).toBeVisible();
    await scan("no schema");
    await pane(page).getByRole("button", { name: "Fetch schema" }).click();
    await expect(problems(page).getByRole("listitem")).toHaveCount(1);
    await expect(explorer(page)).toBeVisible();
    await scan("schema and a problem");

    for (const width of [360, 390, 820, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      // On a phone the composer's sections are an accordion: Body is opened again when it is not the open one.
      if (!(await explorer(page).isVisible())) await page.getByRole("button", { name: "Body", exact: true }).click();
      await expect(explorer(page)).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: `at ${width} px` }).toBeLessThanOrEqual(0);
      // Polled, like the width: a change of layout takes a moment.
      await expect
        .poll(
          async () => {
            const boxes = await Promise.all([explorer(page).boundingBox(), problems(page).boundingBox(), pane(page).getByRole("button", { name: "Refresh schema" }).boundingBox()]);
            return boxes.every((box) => !!box && box.x >= 0 && box.x + box.width <= width);
          },
          { message: `the explorer, the problems and Refresh schema at ${width} px` }
        )
        .toBe(true);
    }
  });
}
