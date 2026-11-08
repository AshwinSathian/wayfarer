import { test, expect } from "@playwright/test";
import { send } from "./support/app";
import { ECHO } from "./support/echo";

// D4-e: the response pane offers the next step for the request in front of it (U-095), and a send that cannot
// go says its one cause once (U-134).

test("a request ready to send is offered Send, not a cURL command or an import", async ({ page }) => {
  await page.goto("/app/");
  const pane = page.locator(".response-pane");
  await expect(pane.getByRole("button", { name: "Paste a cURL command" })).toBeVisible();
  await page.locator("input.address-url").fill(`${ECHO}/echo`);
  await expect(pane).toContainText(/^Send this request \((⌘↵|Ctrl\+Enter)\) and its response shows here\.$/);
  await expect(pane.getByRole("button", { name: "Paste a cURL command" })).toHaveCount(0);
});

test("an address that is not one because a variable has no value says that, once", async ({ page }) => {
  await page.goto("/app/");
  await page.locator("input.address-url").fill("{{base}}/echo?a=1");
  await send(page);
  await expect(
    page
      .getByText(
        "{{base}} has no value, so the address is not complete. Give it a value in an environment or the collection.",
      )
      .first(),
  ).toBeVisible();
  await expect(page.getByText("is not an address a request can go to")).toHaveCount(0);
  await expect(page.getByText(/^Missing:/)).toHaveCount(0);
  await expect(page.locator(".var-chip.var-missing")).toContainText("base");
});

test.describe("the first run's example", () => {
  // With the service worker in control, WebKit's page.route does not see the page's request, and the real API answered.
  test.use({ serviceWorkers: "block" });

  test("Try an example puts an address in the tab and sends nothing until Send", async ({ page }) => {
    const asked: string[] = [];
    await page.route("https://jsonplaceholder.typicode.com/**", (route) => {
      asked.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: '{"userId":1,"id":1,"title":"delectus aut autem","completed":false}',
      });
    });
    await page.goto("/app/");
    await page.locator(".response-pane").getByRole("button", { name: "Try an example" }).click();
    const address = page.locator("input.address-url");
    await expect(address).toHaveValue("https://jsonplaceholder.typicode.com/todos/1");
    await expect(address).toBeFocused();
    expect(asked).toEqual([]);
    await send(page);
    await expect(page.locator(".status-badge")).toHaveText("200");
    expect(asked).toEqual(["https://jsonplaceholder.typicode.com/todos/1"]);
  });
});
