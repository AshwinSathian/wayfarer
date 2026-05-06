import { Injectable, signal } from "@angular/core";

const STORAGE_KEY = "api-sandbox:theme";

@Injectable({ providedIn: "root" })
export class ThemeService {
  readonly theme = signal<"dark" | "light">("dark");

  constructor() {
    let initial: "dark" | "light" = "dark";
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark") {
        initial = stored;
      }
    } catch {
      // localStorage unavailable
    }
    this.theme.set(initial);
    this.applyTheme(initial);
  }

  toggle(): void {
    const next = this.theme() === "dark" ? "light" : "dark";
    this.theme.set(next);
    this.applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignored
    }
  }

  private applyTheme(theme: "dark" | "light"): void {
    document.documentElement.setAttribute("data-theme", theme);
  }
}
