import { expect, test, type Page } from "@playwright/test";
import { seedAndOpen, send } from "./support/app";
import { ECHO } from "./support/echo";

// P2.4: a variable of the collection and a global one, set in their editors,
// as the echo-server received them.

interface Echo {
  query: Record<string, string>;
  headers: [string, string][];
}

async function sendAndEcho(page: Page): Promise<Echo> {
  const response = page.waitForResponse((r) => r.url().startsWith(`${ECHO}/echo`) && r.request().method() !== "OPTIONS");
  await send(page);
  return (await (await response).json()) as Echo;
}

/** Adds the variables in the dialog that is open, and saves. */
async function addVariables(page: Page, dialogName: string, variables: Record<string, string>): Promise<void> {
  const dialog = page.getByRole("dialog", { name: dialogName });
  let rows = 0;
  for (const [name, value] of Object.entries(variables)) {
    await dialog.getByRole("button", { name: "Add variable" }).click();
    rows += 1;
    // The row is drawn a frame after the click.
    await expect(dialog.getByPlaceholder("name")).toHaveCount(rows);
    await dialog.getByPlaceholder("name").last().fill(name);
    await dialog.getByPlaceholder("value").last().fill(value);
  }
  await dialog.getByRole("button", { name: "Save variables" }).click();
  await expect(dialog).toBeHidden();
}

test("a collection variable and a global reach the server, an environment's value wins, and both are kept over a reload", async ({ page }) => {
  await seedAndOpen(
    page,
    { winner: "from-environment" },
    {
      method: "GET",
      url: `${ECHO}/echo?c={{fromCollection}}`,
      headers: { "X-Global": "{{fromGlobal}}", "X-Winner": "{{winner}}", "X-Second": "{{second}}" },
    }
  );

  await page.getByRole("button", { name: "Global variables" }).click();
  await addVariables(page, "Global variables", { fromGlobal: "g-1", winner: "from-global", second: "from-global" });

  await page.getByText("Tripwire collection", { exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Variables" }).click();
  await addVariables(page, "Collection variables", { fromCollection: "c-1", winner: "from-collection", second: "from-collection" });

  // The chips name where each value comes from.
  const chips = page.locator("app-variable-chips");
  await expect(chips.getByRole("button", { name: "Variable fromCollection, source collection" })).toContainText("c-1");
  await expect(chips.getByRole("button", { name: "Variable fromGlobal, source global" })).toContainText("g-1");
  await expect(chips.getByRole("button", { name: "Variable winner, source environment" })).toContainText("from-environment");
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
  await page.getByText("Tripwire request", { exact: true }).dblclick();
  await expect(page.locator("input.address-url")).toHaveValue(`${ECHO}/echo?c={{fromCollection}}`);
  check(await sendAndEcho(page));
});

test("variables that refer to each other are not sent: the composer says which", async ({ page }) => {
  await seedAndOpen(page, { a: "{{b}}", b: "{{a}}" }, { method: "GET", url: `${ECHO}/echo`, headers: { "X-A": "{{a}}" } });
  let requests = 0;
  page.on("request", (request) => {
    if (request.url().startsWith(ECHO)) requests += 1;
  });

  await send(page);

  await expect(page.getByText("Variables refer to each other in a circle: {{a}} → {{b}} → {{a}}.").first()).toBeVisible();
  expect(requests).toBe(0);
});
