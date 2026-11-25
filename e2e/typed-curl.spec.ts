import { test, expect } from "@playwright/test";
import { dumpIdb } from "./support/app";
import { ECHO } from "./support/echo";

// S5a: text typed (or dropped, or spoken) into the address, which a paste would have turned into a request, is offered
// as one in the route strip's problem line. Run with CI=1.

test("@claim:C-107 a cURL command typed into the address is offered as an import, and importing reads it without running it", async ({
  page,
}) => {
  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith(ECHO)) sent.push(request.url());
  });
  await page.goto("/app/");
  const address = page.locator("input.address-url");
  await address.fill(`curl -X POST ${ECHO}/echo -H 'x-typed: yes' --data-raw 'a=1'`);
  const problem = page.locator(".route-problem");
  await expect(problem).toContainText("This looks like a cURL command. Import it.");
  const before = JSON.stringify({ ...(await dumpIdb(page)), tabs: [] });
  await problem.getByRole("button", { name: "Import as request" }).click();
  await expect(address).toHaveValue(`${ECHO}/echo`);
  await expect(page.getByRole("textbox", { name: "HTTP method" })).toHaveValue("POST");
  await expect(problem).not.toContainText("cURL");
  // Read, not run: nothing went to the server, and nothing was saved to a collection or to history.
  expect(sent).toEqual([]);
  expect(JSON.stringify({ ...(await dumpIdb(page)), tabs: [] })).toBe(before);
});

test("@claim:C-107 a method typed before an address is offered as the method and the address", async ({ page }) => {
  await page.goto("/app/");
  const address = page.locator("input.address-url");
  await address.fill(`post ${ECHO}/echo`);
  const problem = page.locator(".route-problem");
  await expect(problem).toContainText(`Use POST for ${ECHO}/echo?`);
  await problem.getByRole("button", { name: "Use it" }).click();
  await expect(address).toHaveValue(`${ECHO}/echo`);
  await expect(page.getByRole("textbox", { name: "HTTP method" })).toHaveValue("POST");
  await expect(problem.getByRole("button")).toHaveCount(0);
});
