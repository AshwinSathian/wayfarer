import { describe, expect, it, vi } from "vitest";
import { showBootFailure } from "./boot-failure";

describe("showBootFailure", () => {
  it("puts a line and Reload in place of the splash, and Reload reloads", () => {
    const root = document.createElement("app-root");
    const splash = document.createElement("div");
    splash.setAttribute("role", "status");
    root.append(splash);
    const reload = vi.fn();
    showBootFailure(root, reload);
    expect(root.querySelector('[role="status"]')).toBeNull();
    const alert = root.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Wayfarer did not start");
    const button = alert?.querySelector("button");
    expect(button?.textContent).toBe("Reload");
    button?.click();
    expect(reload).toHaveBeenCalledOnce();
  });
});
