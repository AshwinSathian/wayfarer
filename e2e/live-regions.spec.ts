import { test, expect } from "@playwright/test";
import { send } from "./support/app";
import { ECHO } from "./support/echo";

// D4.11 (U-061, U-062, U-075; WCAG 4.1.3): what a send did and an error after an action are said by live regions
// that are in the page from the first render, so a screen reader hears them. Their text is what is checked here;
// what VoiceOver says of them is recorded in the PR.

test("the response pane's status region says Sending… during a send and then the status line", async ({ page }) => {
  await page.goto("/app/");
  const region = page.getByRole("status").and(page.locator(".response-announcement"));
  // There before anything was sent, empty.
  await expect(region).toHaveCount(1);
  await expect(region).toHaveText("");

  await page.locator("input.address-url").fill(`${ECHO}/delay/800`);
  await send(page);
  await expect(region).toHaveText("Sending…");
  await expect(region).toHaveText(/^200 OK, [\d.]+ ms, Direct$/);
});

test("a send that got no response is said by its first sentence", async ({ page }) => {
  await page.goto("/app/");
  const region = page.locator(".response-announcement");
  await page.locator("input.address-url").fill("http://127.0.0.1:9/nothing-listens");
  await send(page);
  // The failure's first sentence, not the paragraph the pane shows.
  await expect(region).toHaveText("The request got no response.");
});

test("the address's error is an alert there from the first render, and the field points to it", async ({ page }) => {
  await page.goto("/app/");
  const alert = page.locator("#address-error");
  await expect(alert).toHaveAttribute("role", "alert");
  await expect(alert).toHaveText("");
  const address = page.locator("input.address-url");
  await address.fill("{{nowhere}}/x");
  await send(page);
  await expect(alert).not.toHaveText("");
  await expect(address).toHaveAttribute("aria-invalid", "true");
  await expect(address).toHaveAttribute("aria-describedby", "address-error");
});

test("a wrong passphrase is an alert, and the field is marked invalid and described by it", async ({ page }) => {
  await page.goto("/app/");
  await page.getByRole("button", { name: "Vault locked", exact: true }).click();
  const create = page.getByRole("dialog", { name: "Create vault passphrase", exact: true });
  const alert = create.getByRole("alert");
  await expect(alert).toHaveText("");
  await create.getByLabel("Choose a passphrase", { exact: true }).fill("short");
  await create.getByPlaceholder("Confirm passphrase", { exact: true }).fill("short");
  await create.getByRole("button", { name: "Create vault" }).click();
  await expect(alert).toHaveText("A passphrase needs at least 8 characters.");
  const field = create.getByLabel("Choose a passphrase", { exact: true });
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toHaveAttribute("aria-describedby", "vault-error");
});
