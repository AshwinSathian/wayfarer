import { expect, test } from "@playwright/test";
import { openSettings } from "./support/app";

// A dialog opened from another (an import's report over Settings) gives focus back when it closes. In
// Safari a click does not focus a button, so the element to give it back to was the page itself, and
// Escape then no longer reached Settings (found by C-033 in CI's WebKit).
test("a dialog closed over another leaves focus in the one under it, so Escape still closes that one", async ({
  page,
}) => {
  const file = {
    name: "env.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        $id: "wayfarer/environments",
        environments: [
          { id: "e-1", meta: { id: "e-1", createdAt: 1, updatedAt: 1 }, name: "Focus env", order: 1, vars: [] },
        ],
      }),
    ),
  };
  await page.goto("/app/");
  const settings = await openSettings(page, "Data and storage");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    settings.getByRole("button", { name: "Import", exact: true }).first().click(),
  ]);
  await chooser.setFiles(file);
  const report = page.getByRole("dialog", { name: "Import environments" });
  await report.getByRole("button", { name: "Confirm import" }).click();
  await expect(report).toHaveCount(0);
  await expect.poll(() => settings.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
