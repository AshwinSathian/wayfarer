import { Injectable, inject, signal } from "@angular/core";
import { Diagnostics } from "./diagnostics";

const STORAGE_KEY = "wayfarer:pane-layout";

/** Where the response goes: beside the request, under it, or by the room the two have (L-6, L-7). */
export type PaneLayoutChoice = "room" | "beside" | "under";
const CHOICES: readonly string[] = ["room", "beside", "under"];

/** The choice, kept in `localStorage`; a browser with none goes by the room. */
@Injectable({ providedIn: "root" })
export class PaneLayout {
  private readonly diagnostics = inject(Diagnostics);
  readonly choice = signal<PaneLayoutChoice>("room");

  constructor() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && CHOICES.includes(stored)) this.choice.set(stored as PaneLayoutChoice);
    } catch (error) {
      this.diagnostics.record(error, "pane layout: localStorage unavailable, going by the room");
    }
  }

  choose(choice: PaneLayoutChoice): void {
    this.choice.set(choice);
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch (error) {
      this.diagnostics.record(error, "pane layout: the choice was not stored");
    }
  }
}
