import { test, type Locator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ECHO } from "../support/echo";

const OUT = process.env["SCREENS_OUT"] ?? "screens/before";
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } } as const;
const THEMES = ["dark", "light"] as const;

/** First line of an error, plus what covered the target if a click was intercepted. */
const why = (error: unknown) => {
  const lines = String(error).split("\n");
  const blocker = lines.find((line) => line.includes("intercepts pointer events"));
  return blocker ? `${lines[0]} [${blocker.trim()}]` : lines[0];
};

const meta = (id: string) => ({ id, createdAt: 1, updatedAt: 1, version: 1 });
const COLLECTION_FILE = JSON.stringify({
  meta: meta("export-1"),
  collection: { id: "col-imp", meta: meta("col-imp"), name: "Imported", order: 9 },
  folders: [{ id: "f-imp", meta: meta("f-imp"), collectionId: "col-imp", name: "Auth", order: 1 }],
  requests: [{ id: "r-imp", meta: meta("r-imp"), collectionId: "col-imp", folderId: "f-imp", name: "Login", method: "POST", url: `${ECHO}/echo`, headers: {}, order: 1 }],
});
const ENV_FILE = JSON.stringify([{ id: "e-imp", meta: meta("e-imp"), name: "Imported env", order: 1, vars: { host: "example.test" } }]);

for (const theme of THEMES) {
  for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
    test(`${theme} ${viewportName}`, async ({ page }) => {
      const dir = join(OUT, `${theme}-${viewportName}`);
      mkdirSync(dir, { recursive: true });
      const report: string[] = [];
      let index = 0;

      page.setDefaultTimeout(6_000);
      await page.setViewportSize(viewport);
      await page.addInitScript((value) => localStorage.setItem("wayfarer:theme", value), theme);
      await page.goto("/");
      const mobile = viewportName === "mobile";

      /** Screenshot of the current state, once nothing is animating. */
      const shot = async (name: string) => {
        await page.waitForFunction(() =>
          document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getComputedTiming().iterations === Infinity)
        );
        await page.waitForTimeout(150);
        index += 1;
        await page.screenshot({ path: join(dir, `${String(index).padStart(2, "0")}-${name}.png`), animations: "disabled", caret: "hide" });
      };
      /** One state. A failure is recorded and the run continues, so a missing shot is visible in report.txt. */
      const state = async (name: string, reach: () => Promise<void>, leave?: () => Promise<void>) => {
        try {
          await reach();
          await shot(name);
          report.push(`ok    ${name}`);
        } catch (error) {
          report.push(`FAIL  ${name}: ${why(error)}`);
        }
        try {
          await leave?.();
        } catch (error) {
          report.push(`FAIL  leaving ${name}: ${why(error)}`);
        }
      };
      /** A step between states. Recorded like a state, so a broken step is visible. */
      const act = async (name: string, run: () => Promise<unknown>) => {
        try {
          await run();
        } catch (error) {
          report.push(`FAIL  step ${name}: ${why(error)}`);
        }
        writeFileSync(join(dir, "report.txt"), report.join("\n") + "\n");
      };
      const button = (name: string | RegExp, scope: Page | Locator = page) => scope.getByRole("button", { name, exact: typeof name === "string" });
      const tab = (name: string, scope: Page | Locator = page) => scope.getByRole("tab", { name, exact: true });
      const dialog = (name: string | RegExp) => page.getByRole("dialog", { name });
      const alert = () => page.getByRole("alertdialog").filter({ visible: true }).first();
      const tree = () => page.getByRole("tree");
      const escape = async () => {
        await page.keyboard.press("Escape");
      };
      const navOpen = () => button("Close navigation").isVisible();
      const openNav = async () => {
        if (mobile && !(await navOpen())) await button("Toggle sidebar").first().click();
      };
      const closeNav = async () => {
        if (mobile && (await navOpen())) await button("Close navigation").click();
      };
      /** A composer section: a tab on desktop, an accordion header on mobile. */
      const section = (name: string) => (mobile ? button(name) : tab(name).first());

      await state("main-empty", () => page.locator("input.address-url").waitFor());

      // Composer tabs.
      for (const name of ["Headers", "Auth", "Scripts", "Params"]) {
        await state(`composer-${name.toLowerCase()}`, async () => {
          await section(name).click();
        });
      }
      await state("composer-params-rows", async () => {
        await page.getByPlaceholder("key").first().fill("page");
        await page.getByPlaceholder("value").first().fill("{{page}}");
        await button("Add parameter").click();
      });
      await state("composer-tests", async () => {
        await section("Scripts").click();
        await button("Add test").click();
      });
      await state("method-select-open", async () => {
        await page.locator(".address-method").click();
        await page.getByRole("option", { name: "POST", exact: true }).waitFor();
      });
      await state("composer-body-post", async () => {
        await page.getByRole("option", { name: "POST", exact: true }).click();
        await section("Body").click();
      });
      await state("composer-body-json-mode", async () => {
        await page.getByRole("button", { name: "JSON", exact: true }).or(page.getByRole("radio", { name: "JSON", exact: true })).first().click();
      });
      await state("tooltip", async () => {
        await button("Copy as cURL").hover();
        await page.getByRole("tooltip").waitFor();
      });

      // Response viewer.
      await act("page locator input address url fill ECHO", () => page.locator("input.address-url").fill(`${ECHO}/content/json?todo=1`));
      await state("response-body", async () => {
        await button("Send request").click();
        await page.locator(".status-badge").filter({ hasText: "200" }).waitFor({ timeout: 15_000 });
      });
      for (const name of ["Headers", "Timings", "Tests", "Body"]) {
        await state(`response-${name.toLowerCase()}`, async () => {
          await page.locator("app-response-viewer").getByRole("tab", { name: new RegExp(`^${name}`) }).click();
        });
      }
      await state("response-export-menu", async () => {
        await button("Export response").click();
        await page.getByRole("menu").waitFor();
      }, escape);

      // Collections.
      await state("dialog-new-collection", async () => {
        await openNav();
        await button("New collection").click();
        await page.locator("#creation-name-input").fill("Billing");
      });
      await act("button Create click", () => button("Create").click());
      await act("collection created", () => tree().getByText("Billing", { exact: true }).waitFor());
      await act("closeNav", () => closeNav());
      await state("dialog-save-to-collection", async () => {
        await button("Save to Collection").click();
        await page.locator("#save-as-name").fill("Get todo");
      });
      await state("dialog-save-collection-select-open", async () => {
        await dialog("Save to Collection").getByRole("combobox").first().click();
        await page.getByRole("option").first().waitFor();
      }, async () => {
        await page.getByRole("option", { name: "Billing" }).click();
      });
      await act("button Save click", () => button("Save").click());
      await state("sidebar-tree", async () => {
        await openNav();
        await tree().getByText("Get todo", { exact: true }).waitFor();
      });
      await state("sidebar-context-menu", async () => {
        await tree().getByText("Billing", { exact: true }).click({ button: "right" });
        await page.getByRole("menu").waitFor();
      }, escape);
      await state("dialog-import-collection", async () => {
        await page.locator('input[type="file"]').first().setInputFiles({ name: "billing.json", mimeType: "application/json", buffer: Buffer.from(COLLECTION_FILE) });
        await dialog("Import collection").waitFor();
      }, async () => {
        // On a phone the dialog is clipped by the drawer and Cancel is off screen.
        if (mobile) await escape();
        else await button("Cancel import").click();
        await dialog("Import collection").waitFor({ state: "hidden" });
      });
      await state("command-palette", async () => {
        await openNav();
        await button("Open command palette").click();
        await page.getByPlaceholder("Type a command").waitFor();
      }, escape);
      await act("closeNav", () => closeNav());

      // Environments.
      await state("dialog-new-environment", async () => {
        await button("New environment").click();
        await page.getByPlaceholder("Environment name").fill("Dev");
      });
      await act("button Create environment click", () => button("Create environment").click());
      await state("environment-editor", async () => {
        await page.locator("app-environments-manager").getByText("Dev", { exact: true }).first().waitFor();
        await button("Add variable").click();
        await page.locator("input[placeholder='KEY']").last().fill("host");
        await page.locator("input[placeholder='Value']").last().fill("{{base}}/v1");
      });
      await state("environment-editor-json", async () => {
        await tab("JSON").click();
      });
      await state("dialog-import-environments", async () => {
        await page.locator('input[type="file"][aria-label="Import environments from file"], input[type="file"]').last().setInputFiles({ name: "envs.json", mimeType: "application/json", buffer: Buffer.from(ENV_FILE) });
        await dialog("Import environments").waitFor();
      }, async () => {
        await button("Cancel import").click();
      });
      await state("environment-select-open", async () => {
        await page.getByRole("combobox").first().click();
        await page.getByRole("option").first().waitFor();
      }, escape);

      // History.
      await state("history-drawer", async () => {
        await button("Request history").click();
        await button("Close history").waitFor();
      });
      await state("history-delete-popup", async () => {
        await button("Delete history entry").first().click();
        await button("Delete", alert()).waitFor();
      }, async () => {
        await button("Cancel", alert()).click();
      });
      await state("history-clear-confirm", async () => {
        await button("Clear all history").click();
        await alert().waitFor();
      }, async () => {
        await button(/^(cancel|no)$/i, alert()).click();
      });
      await act("button Close history click", () => button("Close history").click());

      // Vault, bridge, secrets, settings.
      await state("dialog-vault-setup", async () => {
        await button(/vault|Unlock secrets|Lock secrets/i).first().click();
        await page.getByRole("dialog").waitFor();
      }, escape);
      await state("dialog-local-bridge", async () => {
        await button("Local Bridge settings").click();
        await dialog("Local Bridge").waitFor();
      }, escape);
      await state("dialog-secrets", async () => {
        await button("Manage secrets").first().click();
        await dialog("Secrets").waitFor();
      }, escape);
      await state("dialog-settings", async () => {
        await button("Settings").click();
        await dialog("Settings").waitFor();
      });
      await state("dialog-settings-reset-confirm", async () => {
        await button("Reset all data").click();
        await alert().waitFor();
      }, async () => {
        await button(/^(cancel|no)$/i, alert()).click();
        // Escape pressed while the confirm is still closing is swallowed.
        await page.waitForTimeout(600);
        await escape();
      });

      if (mobile) {
        await state("mobile-navigation-drawer", async () => {
          await openNav();
          await button("Close navigation").waitFor();
        }, closeNav);
      }

      writeFileSync(join(dir, "report.txt"), report.join("\n") + "\n");
    });
  }
}
