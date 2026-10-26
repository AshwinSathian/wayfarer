import { Injectable, computed, inject, signal } from "@angular/core";
import { Diagnostics } from "./diagnostics";

const STORAGE_KEY = "wayfarer:theme";

/** What the user chose: one of the two themes, or whatever the system says. */
export type ThemeChoice = "system" | "light" | "dark";
const CHOICES: readonly string[] = ["system", "light", "dark"];

/**
 * The app's theme. The choice is kept in `localStorage`; a browser with none
 * follows the system, and keeps following it when the system changes.
 */
@Injectable({ providedIn: "root" })
export class Theme {
  private readonly diagnostics = inject(Diagnostics);
  private readonly systemDark = matchMedia("(prefers-color-scheme: dark)");
  /** The system's own preference, read again when it changes. */
  private readonly system = signal<"dark" | "light">(this.systemDark.matches ? "dark" : "light");

  readonly choice = signal<ThemeChoice>("system");
  /** The theme that is drawn. */
  readonly theme = computed<"dark" | "light">(() =>
    this.choice() === "system" ? this.system() : (this.choice() as "dark" | "light"),
  );

  constructor() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && CHOICES.includes(stored)) this.choice.set(stored as ThemeChoice);
    } catch (error) {
      this.diagnostics.record(error, "theme: localStorage unavailable, following the system");
    }
    this.apply();
    this.systemDark.addEventListener("change", (event) => {
      this.system.set(event.matches ? "dark" : "light");
      this.apply();
    });
  }

  choose(choice: ThemeChoice): void {
    this.choice.set(choice);
    this.apply();
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch (error) {
      this.diagnostics.record(error, "theme: could not save the theme choice");
    }
  }

  /** The other theme from the one drawn now: a choice of its own, which stops following the system. */
  toggle(): void {
    this.choose(this.theme() === "dark" ? "light" : "dark");
  }

  /**
   * Draws the theme. Its colours change in one frame (U-122): while the
   * attribute changes, `data-theme-changing` holds every transition off
   * (animations.css), the styles are worked out, and the next frame lets
   * transitions run again. A theme change starts none.
   */
  private apply(): void {
    const root = document.documentElement;
    if (root.getAttribute("data-theme") === this.theme()) return;
    root.setAttribute("data-theme-changing", "");
    root.setAttribute("data-theme", this.theme());
    // A layout works out every element's style now, with no transition; the
    // attribute goes after the next frame's style, which then has nothing left to change.
    void root.offsetWidth;
    requestAnimationFrame(() => requestAnimationFrame(() => root.removeAttribute("data-theme-changing")));
  }
}
