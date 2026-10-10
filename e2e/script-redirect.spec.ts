import { expect, test } from "@playwright/test";
import { TARGET, captureTarget, dumpIdb, protectVariable, seedAndOpen, send } from "./support/app";

// Plan Q6 (built with P3.9): a pre-request script that points a request
// with a vault secret at another host does not send it there unasked. Run
// with CI=1 (the production build).

// Routed hosts must not be shadowed by the app's service worker.
test.use({ serviceWorkers: "block" });

const ELSEWHERE = "https://elsewhere.test";
const SECRET = "redirected-vault-secret-7c1e";

test("@claim:C-053 a pre-request script moved a request with a vault secret to another host: the app asks, sends nothing on a no and undoes what the script set", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const composed = await captureTarget(page);
  const elsewhere = await captureTarget(page, undefined, ELSEWHERE);
  await seedAndOpen(page, { base: TARGET }, {
    method: "GET",
    url: "{{base}}/items",
    headers: { "X-Api-Key": "{{API_TOKEN}}" },
    // The host comes from a variable, not from pm.request.url: the question is asked of the request as it resolves.
    preRequestScript: `pm.environment.set("base", "${ELSEWHERE}"); pm.environment.set("trace", "set-by-the-script");`,
  });
  await protectVariable(page, "API_TOKEN", SECRET);
  const variables = async () => JSON.stringify((await dumpIdb(page))["environments"]);

  await send(page);
  const question = page.getByRole("alertdialog", { name: "Send to a different host?" });
  await expect(question).toContainText("from tripwire.test to elsewhere.test");
  await expect(question).toContainText("vault secret");
  // Nothing went anywhere while the question is open.
  expect([...composed, ...elsewhere]).toEqual([]);

  await question.getByRole("button", { name: "Don't send", exact: true }).click();
  await expect(page.getByText("The request was not sent, and what the pre-request script set was undone.")).toBeVisible();
  await expect.poll(variables).toContain(`"key":"base","value":"${TARGET}"`);
  expect(await variables()).not.toContain("set-by-the-script");
  expect([...composed, ...elsewhere]).toEqual([]);

  // Sent again, it is asked again: the variable is back, so the script moves the request once more.
  await send(page);
  await expect(question).toContainText("from tripwire.test to elsewhere.test");
  await question.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator(".status-badge")).toHaveText("200");
  // The user said yes: it went where the script pointed it, with the secret, and nowhere else.
  expect(composed).toEqual([]);
  expect(elsewhere).toHaveLength(1);
  expect(elsewhere[0].headers()["x-api-key"]).toBe(SECRET);
  expect(errors).toEqual([]);
});
