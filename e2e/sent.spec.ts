import { expect, test, type Locator, type Page } from "@playwright/test";
import { dumpIdb, protectVariable, seedAndOpen, send } from "./support/app";
import { routeThroughBridge, startBridge } from "./support/bridge";
import { ECHO } from "./support/echo";
import { found } from "./support/secret-scan";

// Overhaul S4b2: the Sent part of the response, what the app built and sent. It is drawn from what history keeps, so a
// secret is *** in it, a send's and a reload's.

const SECRET = 'sent/sek"ret+val&ue-7c1d';
const viewer = (page: Page) => page.locator("app-response-viewer");
const sentTab = (page: Page) => viewer(page).getByRole("tab", { name: "Sent", exact: true });
const answered = (page: Page) => expect(page.locator(".status-badge")).toBeVisible({ timeout: 15_000 });
/** The Sent part, opened: its text as a person reads it. */
async function openSent(page: Page): Promise<Locator> {
  await sentTab(page).click();
  const part = viewer(page).locator(".sent-request");
  await expect(part).toBeVisible();
  return part;
}

test("@claim:C-102 the Sent part shows the method, the address, the headers the app set and the body, and says a browser adds headers a page cannot see", async ({
  page,
}) => {
  await seedAndOpen(
    page,
    {},
    {
      method: "POST",
      url: `${ECHO}/echo?x=1`,
      headers: { "X-Plain": "visible-value" },
      storedBody: { mode: "raw", raw: { language: "text", text: "plain body" } },
    },
  );
  // Nothing was sent: there is no Sent part.
  await expect(sentTab(page)).toHaveCount(0);
  await send(page);
  await answered(page);
  const part = await openSent(page);
  await expect(part.locator(".sent-line")).toHaveText(`POST ${ECHO}/echo?x=1`);
  await expect(part.locator(".sent-headers")).toContainText("X-Plain");
  await expect(part.locator(".sent-headers")).toContainText("visible-value");
  await expect(part.locator(".sent-body")).toHaveText("plain body");
  await expect(viewer(page).locator(".sent-note")).toHaveText(
    "A browser adds its own headers (Host, User-Agent and others) that a page cannot see.",
  );
  await expect(viewer(page).locator(".sent-secrets")).toHaveText("Nothing was filled from the vault.");
  // No secret, nothing masked: it does not say so.
  await expect(viewer(page).locator(".sent-masked")).toHaveCount(0);
});

test("a request with no body says so, and one sent in a tab is still that tab's when another is open", async ({
  page,
}) => {
  await page.goto("/app/");
  await page.locator("input.address-url").fill(`${ECHO}/delay/700`);
  await send(page);
  // The tab's send is on its way when another opens: it ends in its own tab.
  await page.getByRole("button", { name: "New tab" }).click();
  await expect(page.getByRole("tablist", { name: "Open requests" }).getByRole("tab")).toHaveCount(2);
  await page.locator("input.address-url").fill(`${ECHO}/echo?second=1`);
  await expect(sentTab(page)).toHaveCount(0);
  await expect(page.locator(".status-badge")).toHaveCount(0);
  // Back in the first, its response and its Sent part are its own.
  await page.getByRole("tablist", { name: "Open requests" }).getByRole("tab").first().click();
  await answered(page);
  const part = await openSent(page);
  await expect(part.locator(".sent-line")).toHaveText(`GET ${ECHO}/delay/700`);
  await expect(part.locator(".sent-no-body")).toHaveText("No body was sent.");
  await expect(part).not.toContainText("second=1");
});

for (const [name, auth] of [
  ["Basic's password", { type: "basic", username: "alice", password: "{{API_TOKEN}}" }],
  [
    "an AWS signature's secret key and session token",
    {
      type: "awsv4",
      accessKey: "AKIDEXAMPLE",
      secretKey: "{{API_TOKEN}}",
      sessionToken: "{{API_TOKEN}}",
      region: "eu-west-1",
      service: "s3",
    },
  ],
] as const) {
  test(`@claim:C-103 a vault secret in ${name}, a header, the address and the body is *** in the Sent part, named by its variable, and after a reload`, async ({
    page,
  }) => {
    test.slow();
    await seedAndOpen(
      page,
      {},
      {
        method: "POST",
        url: `${ECHO}/echo?token={{API_TOKEN}}`,
        headers: { "X-Api-Key": "{{API_TOKEN}}", "X-Mirror": "m-{{API_TOKEN}}" },
        auth,
        storedBody: { mode: "raw", raw: { language: "json", text: '{"t":"{{API_TOKEN}}"}' } },
      },
    );
    await protectVariable(page, "API_TOKEN", SECRET);
    await send(page);
    await answered(page);
    await expect(page.locator(".status-badge")).toHaveText("200");
    const part = await openSent(page);
    const before = await part.innerText();
    await expect(part.locator(".sent-headers")).toContainText("Authorization");
    await expect(part.locator(".sent-line")).toContainText("token=");
    const shown = await viewer(page).locator(".sent-request, .sent-secrets, .sent-masked, .sent-note").allInnerTexts();
    const text = shown.join("\n");
    expect(found(text, SECRET)).toEqual([]);
    expect(text).toContain("***");
    // A secret is named by its variable, and the words say where it is masked, never that it was not sent.
    await expect(viewer(page).locator(".sent-secrets")).toContainText("Vault secrets filled: API_TOKEN");
    await expect(viewer(page).locator(".sent-masked")).toHaveText(
      "Vault secrets and credentials are *** here, as they are in history and exports.",
    );
    await expect(viewer(page).locator(".sent-request")).not.toContainText(/not sent/i);

    // What history keeps is what the part shows, after a reload as before it.
    await expect.poll(async () => (await dumpIdb(page))["history"]?.length ?? 0).toBe(1);
    expect(found(JSON.stringify((await dumpIdb(page))["history"]), SECRET)).toEqual([]);
    // A tab is written 250 ms after it last changed, with the key of the entry its response is kept under.
    await expect.poll(async () => JSON.stringify((await dumpIdb(page))["tabs"] ?? [])).toMatch(/"historyKey":\d+/);
    await page.reload();
    await expect(page.locator("input.address-url")).toHaveValue(/echo/);
    await expect(viewer(page).locator(".status-badge")).toBeVisible();
    const again = await openSent(page);
    expect(await again.innerText()).toBe(before);
    const afterReload = (await viewer(page).locator(".sent-request, .sent-secrets, .sent-masked").allInnerTexts()).join(
      "\n",
    );
    expect(found(afterReload, SECRET)).toEqual([]);
    expect(afterReload).toContain("***");
    await expect(viewer(page).locator(".sent-secrets")).toContainText("Vault secrets filled: API_TOKEN");
  });
}

test.describe("through a Local Bridge", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "the Local Bridge is started for Chromium only (plan P5.4)",
  );

  test("@claim:C-103 the cookies of the jar are *** in the Sent part, with Basic's credentials, and it says what the bridge adds", async ({
    page,
  }) => {
    const bridge = await startBridge();
    try {
      await page.goto("/app/");
      await routeThroughBridge(page, bridge);
      await page.locator("input.address-url").fill(`${ECHO}/cookies/set?session=jar-cookie-9d41e7`);
      await send(page);
      await answered(page);
      // The next request carries the cookie, and Basic credentials typed in the Authorization header.
      await page.locator("input.address-url").fill(`${ECHO}/echo`);
      await page
        .locator("app-composer")
        .getByRole("tab", { name: /^Headers( |$)/ })
        .first()
        .click();
      await page.locator("app-headers-panel").getByPlaceholder("Name", { exact: true }).first().fill("Authorization");
      await page
        .locator("app-headers-panel")
        .getByPlaceholder("Value", { exact: true })
        .first()
        .fill("Basic YWxpY2U6YmFzaWMtcHctMzMyMQ==");
      await send(page);
      await expect(viewer(page).locator(".status-badge")).toHaveText("200");
      const part = await openSent(page);
      await expect(part.locator(".sent-headers")).toContainText("Cookie");
      const text = (await viewer(page).locator(".sent-request, .sent-note").allInnerTexts()).join("\n");
      expect(text).not.toContain("jar-cookie-9d41e7");
      expect(text).not.toContain("YWxpY2U6YmFzaWMtcHctMzMyMQ");
      expect(found(text, "basic-pw-3321")).toEqual([]);
      await expect(part.locator(".sent-headers tr", { hasText: "Cookie" }).locator("td")).toHaveText("***");
      await expect(part.locator(".sent-headers tr", { hasText: "Authorization" }).locator("td")).toHaveText("***");
      await expect(viewer(page).locator(".sent-note")).toHaveText(
        "The Local Bridge sent this from your computer. It adds headers of its own (Host and others) that are not listed here.",
      );
    } finally {
      bridge.stop();
    }
  });
});
