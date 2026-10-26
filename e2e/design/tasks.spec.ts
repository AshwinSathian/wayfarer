import { writeFileSync, mkdirSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { ECHO } from "../support/echo";

// D0.2 of PLAN-design.md: the eight tasks of D1.4, done on today's app the shortest way it offers, each
// input counted. A click is one event, a key press is one, and each character typed is one (a pasted value
// would be one, but nobody pastes a URL they have not copied). The time is the script's, from the first
// input to the result on the screen: the app's own waiting, not a person's, who reads and thinks as well.
// Each task runs three times; docs/design/baseline.md gives the median. The counts land in
// test-results/design-tasks/<project>-<task>.json.

const RUNS = 3;
// A step that is wrong fails at once, not after the test's four minutes.
test.use({ actionTimeout: 10_000 });

/** Counts what a person would do. */
class User {
  clicks = 0;
  keys = 0;
  typed = 0;
  constructor(readonly page: Page) {}
  get events(): number {
    return this.clicks + this.keys + this.typed;
  }
  async click(target: Locator, options: { button?: "right" } = {}): Promise<void> {
    await target.click(options);
    this.clicks++;
  }
  async press(key: string): Promise<void> {
    await this.page.keyboard.press(key);
    this.keys++;
  }
  /** Types into a field: a click to focus it, then one event per character. */
  async type(target: Locator, text: string, focus = true): Promise<void> {
    if (focus) await this.click(target);
    await target.fill(text);
    this.typed += [...text].length;
  }
  /** Picks a file in the system's dialog: the click that opens it, and one to choose the file. */
  async pick(opener: Locator, file: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
    const chooser = this.page.waitForEvent("filechooser");
    await this.click(opener);
    await (await chooser).setFiles(file);
    this.clicks++;
  }
}

const button = (scope: Page | Locator, name: string | RegExp) =>
  scope.getByRole("button", { name, exact: typeof name === "string" });
const address = (page: Page) => page.locator("input.address-url");
const send = (page: Page) => page.getByRole("button", { name: "Send request" });

/** A Postman collection of two requests, each with a test script, as Postman writes it. */
const POSTMAN = {
  info: {
    name: "Shop",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  item: ["orders", "customers"].map((name) => ({
    name: `List ${name}`,
    event: [
      {
        listen: "test",
        script: { exec: ['pm.test("status is 200", () => pm.response.to.have.status(200));'], type: "text/javascript" },
      },
    ],
    request: { method: "GET", url: `${ECHO}/content/json?list=${name}` },
  })),
};

const file = (name: string, mimeType: string, text: string) => ({ name, mimeType, buffer: Buffer.from(text) });

async function ready(page: Page): Promise<void> {
  await page.goto("/app/");
  await expect(address(page)).toBeVisible();
}

/** Imports the Postman collection and trusts its scripts: what task 2 does, and task 7 starts from. */
async function importAndTrust(user: User): Promise<void> {
  const { page } = user;
  await user.pick(
    button(page, "Import collection"),
    file("shop.postman_collection.json", "application/json", JSON.stringify(POSTMAN)),
  );
  const dialog = page.getByRole("dialog", { name: "Import collection" });
  await user.click(button(dialog, "Import"));
  await expect(dialog).toHaveCount(0);
  // A run does not offer the review: it sends without the scripts. The review is in a request's Scripts tab.
  await user.click(page.getByRole("tree").getByText("List orders", { exact: true }));
  await user.click(page.locator("app-composer").getByRole("tab", { name: "Scripts", exact: true }));
  await user.click(button(page.locator(".scripts-held"), "Review scripts"));
  const review = page.getByRole("dialog", { name: "Review scripts" });
  await user.click(button(review, "I trust these scripts"));
  await expect(review).toHaveCount(0);
}

async function run(user: User, collection: string): Promise<Locator> {
  const { page } = user;
  await user.click(page.getByRole("tree").getByText(collection, { exact: true }), { button: "right" });
  await user.click(page.getByRole("menuitem", { name: "Run…" }));
  return page.locator("app-run-view");
}

interface Task {
  id: string;
  name: string;
  /** What has to be in place before the first input: not counted. */
  before?: (page: Page) => Promise<void>;
  do: (user: User) => Promise<void>;
}

const TASKS: Task[] = [
  {
    id: "1",
    name: "First request from nothing",
    do: async (user) => {
      // D4.2: the caret is in the address when the app opens, and Enter there sends.
      await expect(address(user.page)).toBeFocused();
      await user.type(address(user.page), `${ECHO}/content/json`, false);
      await user.press("Enter");
      await expect(user.page.locator(".status-badge")).toHaveText("200");
    },
  },
  {
    id: "2",
    name: "Import a Postman collection with scripts and run it",
    do: async (user) => {
      await importAndTrust(user);
      const view = await run(user, "Shop");
      await user.click(button(view, "Run"));
      await expect(view.getByText("The run is complete")).toBeVisible({ timeout: 30_000 });
      await expect(view).toContainText("2 passed");
    },
  },
  {
    id: "3",
    name: "Add an environment and switch to it",
    do: async (user) => {
      const { page } = user;
      await user.click(button(page, "Environments"));
      await user.click(button(page, "New environment").first());
      await user.type(page.locator("#new-env-name-input"), "Staging", false);
      // Enter in the name does not create it: a click.
      await user.click(button(page, "Create environment"));
      await user.click(button(page, "Add variable"));
      await user.type(page.getByPlaceholder("KEY", { exact: true }).last(), "baseUrl");
      await user.type(page.getByPlaceholder("Value", { exact: true }).last(), ECHO);
      await user.click(button(page, "Save changes"));
      await user.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await user.click(page.getByRole("banner").getByRole("combobox", { name: "Environment" }));
      await user.click(page.getByRole("option", { name: "Staging" }));
      await expect(page.getByRole("banner").getByRole("combobox", { name: "Environment" })).toContainText("Staging");
    },
  },
  {
    id: "4",
    name: "Use a secret without it touching disk",
    do: async (user) => {
      const { page } = user;
      const passphrase = "correct horse battery staple";
      await user.click(button(page, "Environments"));
      await user.click(button(page, "New environment").first());
      await user.type(page.locator("#new-env-name-input"), "Prod", false);
      // Enter in the name does not create it: a click.
      await user.click(button(page, "Create environment"));
      await user.click(button(page, "Add variable"));
      await user.type(page.getByPlaceholder("KEY", { exact: true }).last(), "token");
      await user.type(page.getByPlaceholder("Value", { exact: true }).last(), "s3cr3t-value");
      await user.click(button(page, "Mark variable as secret").last());
      const create = page.getByRole("dialog", { name: "Create vault passphrase", exact: true });
      await user.type(create.locator("input[type='password']").nth(0), passphrase, false);
      await user.type(create.locator("input[type='password']").nth(1), passphrase);
      await user.click(button(create, "Create vault"));
      await expect(create).toHaveCount(0);
      await user.click(button(page, "Mark variable as secret").last());
      await expect(page.getByText("Secret stored")).toBeVisible();
      await user.click(button(page, "Save changes"));
      await user.press("Escape");
      await user.click(page.getByRole("banner").getByRole("combobox", { name: "Environment" }));
      await user.click(page.getByRole("option", { name: "Prod" }));
      await user.type(address(page), `${ECHO}/echo?token={{token}}`);
      await user.click(send(page));
      await expect(page.locator(".status-badge")).toHaveText("200");
    },
  },
  {
    id: "5a",
    name: "Find why a request failed: CORS",
    do: async (user) => {
      await user.type(address(user.page), `${ECHO}/cors/none`);
      await user.click(send(user.page));
      await expect(user.page.locator("app-response-viewer")).toContainText("CORS", { timeout: 15_000 });
    },
  },
  {
    id: "5b",
    name: "Find why a request failed: DNS",
    do: async (user) => {
      await user.type(address(user.page), "http://no-such-host.invalid/");
      await user.click(send(user.page));
      await expect(user.page.locator("app-response-viewer")).toContainText(/DNS|name|host/i, { timeout: 15_000 });
    },
  },
  {
    id: "5c",
    name: "Find why a request failed: 401",
    do: async (user) => {
      await user.type(address(user.page), `${ECHO}/status/401`);
      await user.click(send(user.page));
      await expect(user.page.locator(".status-badge")).toHaveText("401");
    },
  },
  {
    id: "6",
    name: "Send the same request to a teammate",
    before: async (page) => {
      await address(page).fill(`${ECHO}/content/json?shared=1`);
    },
    do: async (user) => {
      // No sharing yet (phase T): the shortest way is a cURL command on the clipboard, sent by other means.
      await user.click(button(user.page, "Copy as cURL"));
      await user.click(user.page.getByRole("menuitem", { name: "Copy as cURL", exact: true }));
      // The screen says what was copied (U-050).
      await expect(user.page.locator("app-address-row .copy-note")).toHaveText("Copied as cURL.");
    },
  },
  {
    id: "7",
    name: "Run a collection with a data file and read the report",
    before: async (page) => {
      await importAndTrust(new User(page));
      const view = await run(new User(page), "Shop");
      await button(view, "Run").click();
      await expect(view.getByText("The run is complete")).toBeVisible({ timeout: 30_000 });
      await page.reload();
      await expect(address(page)).toBeVisible();
    },
    do: async (user) => {
      const view = await run(user, "Shop");
      await user.pick(button(view, "Data file…"), file("ids.csv", "text/csv", "id\n1\n2\n"));
      await user.click(button(view, "Run"));
      await expect(view.getByText("The run is complete")).toBeVisible({ timeout: 30_000 });
      await expect(view).toContainText("4 passed");
    },
  },
  {
    id: "8",
    name: "Find a request sent last week",
    before: async (page) => {
      // Last week, three requests; today, one more.
      await page.clock.setFixedTime(new Date(Date.now() - 7 * 24 * 3600_000));
      for (const path of ["/content/json?report=weekly", "/status/204", "/content/xml"]) {
        await address(page).fill(`${ECHO}${path}`);
        await send(page).click();
        await expect(page.locator(".status-badge")).toBeVisible();
      }
      await page.clock.setFixedTime(new Date());
      await address(page).fill(`${ECHO}/content/text`);
      await send(page).click();
      await expect(page.locator(".status-badge")).toBeVisible();
    },
    do: async (user) => {
      const { page } = user;
      await user.click(button(page, "Request history"));
      const history = page.getByRole("dialog", { name: /history/i });
      await user.type(history.getByPlaceholder("Search by URL, method or status"), "weekly");
      await user.click(history.getByText(/report=weekly/).first());
      await expect(address(page)).toHaveValue(/report=weekly/);
    },
  },
];

interface Measure {
  id: string;
  name: string;
  clicks: number;
  keys: number;
  typed: number;
  events: number;
  seconds: number[];
  /** For a failure (task 5): what the response pane says, the user's lead to the cause. */
  says?: string;
}

for (const task of TASKS) {
  test(`task ${task.id}: ${task.name}`, async ({ browser }, info) => {
    test.setTimeout(240_000);
    const seconds: number[] = [];
    let counted: User | undefined;
    let says: string | undefined;
    for (let i = 0; i < RUNS; i++) {
      // Each run in a browser of its own: nothing stored, nothing cached.
      const context = await browser.newContext({ ...info.project.use, viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await ready(page);
      await task.before?.(page);
      const user = new User(page);
      const start = performance.now();
      await task.do(user);
      seconds.push((performance.now() - start) / 1000);
      if (task.id.startsWith("5"))
        says = (await page.locator("app-response-viewer").innerText()).replace(/\s+/g, " ").trim();
      await context.close();
      if (counted && counted.events !== user.events) throw new Error(`task ${task.id}: the count changed between runs`);
      counted = user;
    }
    if (!counted) return;
    const { clicks, keys, typed, events } = counted;
    const measure: Measure = { id: task.id, name: task.name, clicks, keys, typed, events, seconds, says };
    mkdirSync("test-results/design-tasks", { recursive: true });
    writeFileSync(`test-results/design-tasks/${info.project.name}-${task.id}.json`, `${JSON.stringify(measure)}\n`);
  });
}
