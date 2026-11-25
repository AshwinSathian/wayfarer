import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  model,
  signal,
  viewChild,
} from "@angular/core";
import { UiModal } from "../../ui/modal";
import { UiMethodGlyph } from "../../ui/method-glyph";
import { recordDiagnostic } from "../../services/diagnostics";
import { ariaKeysOf, keysOf, Shortcut } from "../../shared/shortcuts";

/** One thing the palette finds: a command, or a request, collection, folder, environment or past request to open. */
export interface PaletteItem {
  id: string;
  group: PaletteGroup;
  label: string;
  /** Also searched, and shown after the label: a request's address, a folder's collection. */
  detail?: string;
  /** A request's method, drawn as a method badge. */
  method?: string;
  keys?: Shortcut;
  /** Found by typing only: a saved request or a collection is not in the list shown before anything is typed. */
  findOnly?: boolean;
  run: () => void | Promise<void>;
}

export type PaletteGroup = "Recent" | "Requests" | "Go to" | "Environments" | "Settings" | "Vault" | "History";

const GROUPS: PaletteGroup[] = ["Recent", "Requests", "Go to", "Environments", "Settings", "Vault", "History"];
/** Rows per group: enough to choose from, few enough to see every group at once. Nothing typed shows fewer. */
const PER_GROUP = 8;
const PER_GROUP_IDLE = 4;
/** What was run last, by item id: Recent shows it first when nothing is typed. Under `wayfarer:`, so Reset all data takes it. */
const RECENT_KEY = "wayfarer:palette-recent";
const RECENT_MAX = 5;

function readRecent(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string").slice(0, RECENT_MAX)
      : [];
  } catch (error) {
    recordDiagnostic(error, "palette: could not read what was run last");
    return [];
  }
}

/**
 * The palette (U-011): the shell's, opened by ⌘K anywhere and by the toolbar's search field. It finds commands and
 * the things a person works with by typing, in groups, with each command's shortcut as keycaps. No title and no close
 * button: Escape and a click outside close it. A combobox over a listbox (WAI-ARIA): focus stays in the field, the
 * arrows move the active row (`aria-activedescendant`), Enter runs it.
 */
@Component({
  selector: "app-palette",
  imports: [UiModal, UiMethodGlyph],
  templateUrl: "./palette.html",
  styleUrl: "./palette.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Palette {
  readonly open = model(false);
  readonly items = input.required<PaletteItem[]>();

  protected readonly query = signal("");
  protected readonly active = signal(0);
  private readonly field = viewChild<ElementRef<HTMLInputElement>>("field");
  private readonly list = viewChild<ElementRef<HTMLElement>>("list");

  private readonly recent = signal<string[]>(readRecent());

  /**
   * Every word typed is somewhere in the label, the detail or the method. With nothing typed: what was run last, then
   * a few of each group (never one flat list of every command); the requests are found by typing.
   */
  protected readonly groups = computed(() => {
    const words = this.query().trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) {
      const recent = this.recent()
        .map((id) => this.items().find((item) => item.id === id && item.group !== "History"))
        .filter((item): item is PaletteItem => !!item);
      const taken = new Set(recent.map((item) => item.id));
      return [
        { name: "Recent" as PaletteGroup, items: recent },
        ...GROUPS.filter((name) => name !== "Recent" && name !== "History").map((name) => ({
          name,
          items: this.items()
            .filter((item) => item.group === name && !taken.has(item.id) && !item.findOnly)
            .slice(0, PER_GROUP_IDLE),
        })),
      ].filter((group) => group.items.length);
    }
    // What starts with the words typed comes first, then what has them in its label, then in its address: Enter on
    // "history" opens History, not the command that mentions it. The sort is stable, so the rest keep their order.
    const typed = words.join(" ");
    const rank = (item: PaletteItem) =>
      item.label.toLowerCase().startsWith(typed)
        ? 0
        : words.every((word) => item.label.toLowerCase().includes(word))
          ? 1
          : 2;
    const found = this.items()
      .filter((item) => {
        const text = `${item.label} ${item.detail ?? ""} ${item.method ?? ""}`.toLowerCase();
        return words.every((word) => text.includes(word));
      })
      .sort((a, b) => rank(a) - rank(b));
    // The group with the best match leads, so that Enter runs the best match and not the first group's.
    return GROUPS.map((name) => ({
      name,
      items: found.filter((item) => item.group === name).slice(0, PER_GROUP),
    }))
      .filter((group) => group.items.length)
      .sort((a, b) => rank(a.items[0]) - rank(b.items[0]));
  });

  protected readonly rows = computed(() => this.groups().flatMap((group) => group.items));

  protected readonly keysOf = keysOf;
  protected readonly ariaKeysOf = ariaKeysOf;

  constructor() {
    // A palette opened again starts empty, at the top.
    effect(() => {
      if (this.open()) return;
      this.query.set("");
      this.active.set(0);
    });
  }

  private remember(id: string): void {
    const next = [id, ...this.recent().filter((other) => other !== id)].slice(0, RECENT_MAX);
    this.recent.set(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch (error) {
      recordDiagnostic(error, "palette: could not save what was run last");
    }
  }

  /** A new search starts at the top. Set here, in the key's own task: an effect ran after the next key, an arrow. */
  protected search(value: string): void {
    this.query.set(value);
    this.active.set(0);
  }

  protected optionId(item: PaletteItem): string {
    return `palette-${item.group.replace(/\W+/g, "-").toLowerCase()}-${item.id}`;
  }

  protected key(event: KeyboardEvent): void {
    const count = this.rows().length;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!count) return;
      this.active.update((at) => (at + (event.key === "ArrowDown" ? 1 : count - 1)) % count);
      this.reveal();
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = this.rows()[this.active()];
      if (item) void this.run(item);
    }
  }

  protected async run(item: PaletteItem): Promise<void> {
    this.open.set(false);
    if (item.group !== "History") this.remember(item.id);
    await Promise.resolve(item.run());
  }

  protected point(item: PaletteItem): void {
    this.active.set(this.rows().indexOf(item));
  }

  /** The active row is scrolled into the list. */
  private reveal(): void {
    queueMicrotask(() => {
      const row = this.list()?.nativeElement.querySelector<HTMLElement>('[aria-selected="true"]');
      row?.scrollIntoView({ block: "nearest" });
      this.field()?.nativeElement.focus();
    });
  }
}
