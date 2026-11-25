import { expect, test, type Page } from "@playwright/test";
import {
  closeEnvironments,
  closeHolderSettings,
  openEnvironments,
  openHolderSettings,
  seedAndOpen,
  send,
} from "./support/app";
import { ECHO } from "./support/echo";

// P2.4: a variable of the collection and a global one, set in their editors,
// as the echo-server received them.

interface Echo {
  query: Record<string, string>;
  headers: [string, string][];
}

async function sendAndEcho(page: Page): Promise<Echo> {
  const response = page.waitForResponse(
    (r) => r.url().startsWith(`${ECHO}/echo`) && r.request().method() !== "OPTIONS",
  );
  await send(page);
  return (await (await response).json()) as Echo;
}

/** Opens the globals in the Environments tab and adds the variables; the rows write as they are left. */
async function addGlobals(page: Page, variables: Record<string, string>): Promise<void> {
  const pane = page.getByRole("region", { name: "Environments", exact: true });
  await pane.getByRole("button", { name: /^Globals/ }).click();
  let rows = 0;
  for (const [name, value] of Object.entries(variables)) {
    await pane.getByRole("button", { name: "Add variable" }).click();
    rows += 1;
    // The row is drawn a frame after the click.
    await expect(pane.getByPlaceholder("Name", { exact: true })).toHaveCount(rows);
    await pane.getByPlaceholder("Name", { exact: true }).last().fill(name);
    await pane.getByPlaceholder("Value", { exact: true }).last().fill(value);
  }
  await pane.getByPlaceholder("Value", { exact: true }).last().blur();
}

test("a collection variable and a global reach the server, an environment's value wins, and both are kept over a reload", async ({
  page,
}) => {
  // Two dialogs of rows, a send, a reload and a second send: 29 to 30 s on GitHub's WebKit runner when it passes (#228).
  test.slow();
  await seedAndOpen(
    page,
    { winner: "from-environment" },
    {
      method: "GET",
      url: `${ECHO}/echo?c={{fromCollection}}`,
      headers: { "X-Global": "{{fromGlobal}}", "X-Winner": "{{winner}}", "X-Second": "{{second}}" },
    },
  );

  await openEnvironments(page);
  await addGlobals(page, { fromGlobal: "g-1", winner: "from-global", second: "from-global" });
  await closeEnvironments(page);

  // A collection's variables are in its settings tab (P4.9, D5-e), with its auth and its scripts, written as typed.
  const settings = await openHolderSettings(page, "Tripwire collection");
  let rows = 0;
  for (const [name, value] of Object.entries({
    fromCollection: "c-1",
    winner: "from-collection",
    second: "from-collection",
  })) {
    await settings.getByRole("button", { name: "Add variable" }).click();
    rows += 1;
    await expect(settings.getByPlaceholder("Name", { exact: true })).toHaveCount(rows);
    await settings.getByPlaceholder("Name", { exact: true }).last().fill(name);
    await settings.getByPlaceholder("Value", { exact: true }).last().fill(value);
  }
  await closeHolderSettings(page, "Tripwire collection");

  // A click on a variable's button opens its popover: where its value comes from, and the value.
  const chips = page.locator("app-variable-chips");
  const variable = async (name: string) => {
    await chips
      .locator(".var-chip")
      .filter({ has: page.locator(".var-chip-name", { hasText: name }) })
      .click();
    return page.getByRole("dialog", { name: `Variable ${name}` });
  };
  let pop = await variable("fromCollection");
  await expect(pop).toContainText('collection "Tripwire collection"');
  await expect(pop).toContainText("c-1");
  await page.keyboard.press("Escape");
  pop = await variable("fromGlobal");
  await expect(pop).toContainText("the globals");
  await expect(pop).toContainText("g-1");
  await page.keyboard.press("Escape");
  // The environment's value hides the collection's (D4.12), and the popover offers to show it where it is set.
  pop = await variable("winner");
  await expect(pop).toContainText('environment "Tripwire env"');
  await expect(pop).toContainText("from-environment");
  await expect(pop).toContainText('Hides the value in collection "Tripwire collection"');
  await expect(pop.getByRole("button", { name: "Show winner in its environment" })).toBeVisible();
  await page.keyboard.press("Escape");
  // Which scope wins is the doc's to explain (U-166).
  const doc = chips.getByRole("link", { name: "Where a value comes from" });
  await expect(doc).toHaveAttribute("href", "../docs/variables/#where-a-value-comes-from");
  await expect(page.getByText(/Missing:/)).toHaveCount(0);

  const check = (echo: Echo) => {
    const header = (name: string) => echo.headers.find(([key]) => key === name)?.[1];
    expect(echo.query).toEqual({ c: "c-1" });
    expect(header("x-global")).toBe("g-1");
    expect(header("x-winner")).toBe("from-environment");
    expect(header("x-second")).toBe("from-collection");
  };
  check(await sendAndEcho(page));

  await page.reload();
  await page.getByRole("tree").getByText("Tripwire request", { exact: true }).click();
  await expect(page.locator("input.address-url")).toHaveValue(`${ECHO}/echo?c={{fromCollection}}`);
  check(await sendAndEcho(page));
});

test("F74: a variable whose name holds a slash or a space reaches the server, and another language's template in a header is sent as written, unasked", async ({
  page,
}) => {
  await seedAndOpen(
    page,
    { "api/key": "k-1", "first name": "Ada" },
    {
      method: "GET",
      url: `${ECHO}/echo?name={{first name}}`,
      headers: { "X-Key": "{{api/key}}", "X-Template": "{{ user.name | upper }}" },
    },
  );
  const chips = page.locator("app-variable-chips");
  for (const [name, value] of [
    ["api/key", "k-1"],
    ["first name", "Ada"],
  ]) {
    await chips.getByRole("button", { name: `${name} Environment` }).click();
    await expect(page.getByRole("dialog", { name: `Variable ${name}` })).toContainText(value);
    await page.keyboard.press("Escape");
  }
  // What is between braces and is no plain name is not a missing variable: nothing asks for it.
  await expect(page.getByText(/Missing:/)).toHaveCount(0);

  const [response] = await Promise.all([
    page.waitForResponse((candidate) => candidate.url().startsWith(`${ECHO}/echo`)),
    send(page),
  ]);
  const echo = (await response.json()) as Echo;
  expect(echo.query).toEqual({ name: "Ada" });
  expect(echo.headers).toContainEqual(["x-key", "k-1"]);
  expect(echo.headers).toContainEqual(["x-template", "{{ user.name | upper }}"]);
});

test("variables that refer to each other are not sent: the composer says which", async ({ page }) => {
  await seedAndOpen(
    page,
    { a: "{{b}}", b: "{{a}}" },
    { method: "GET", url: `${ECHO}/echo`, headers: { "X-A": "{{a}}" } },
  );
  let requests = 0;
  page.on("request", (request) => {
    if (request.url().startsWith(ECHO)) requests += 1;
  });

  await send(page);

  await expect(
    page.getByText("Variables refer to each other in a circle: {{a}} → {{b}} → {{a}}.").first(),
  ).toBeVisible();
  expect(requests).toBe(0);
});
