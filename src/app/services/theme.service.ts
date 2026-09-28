import { Injectable, signal, inject } from "@angular/core";
import { DiagnosticsService } from "./diagnostics.service";

const STORAGE_KEY = "wayfarer:theme";
const LEGACY_STORAGE_KEY = "api-sandbox:theme";

@Injectable({ providedIn: "root" })
export class ThemeService {
  private readonly diagnostics = inject(DiagnosticsService);
  readonly theme = signal<"dark" | "light">("dark");

  constructor() {
    let initial: "dark" | "light" = "dark";
    try {
      const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
      if (stored === "light" || stored === "dark") {
        initial = stored;
      }
    } catch (error) {
      this.diagnostics.record(error, "theme: localStorage unavailable, using the default theme");
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
    } catch (error) {
      this.diagnostics.record(error, "theme: could not save the theme choice");
    }
  }

  private applyTheme(theme: "dark" | "light"): void {
    document.documentElement.setAttribute("data-theme", theme);
  }
}
