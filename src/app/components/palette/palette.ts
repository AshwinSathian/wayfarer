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
  run: () => void | Promise<void>;
}

export type PaletteGroup = "Commands" | "Requests" | "Collections and folders" | "Environments" | "History";

const GROUPS: PaletteGroup[] = ["Commands", "Requests", "Collections and folders", "Environments", "History"];
/** Rows per group: enough to choose from, few enough to see every group at once. */
const PER_GROUP = 6;

/**
 * The palette (U-011): the shell's, opened by ⌘K anywhere and by the toolbar's search field. It finds commands and
 * the things a person works with by typing, in groups, with each command's shortcut as keycaps. No title and no close
 * button: Escape and a click outside close it. A combobox over a listbox (WAI-ARIA): focus stays in the field, the
 * arrows move the active row (`aria-activedescendant`), Enter runs it.
 */
@Component({
  selector: "app-palette",
  imports: [UiModal],
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

  /** Every word typed is somewhere in the label or the detail. With nothing typed: the commands and the environments. */
  protected readonly groups = computed(() => {
    const words = this.query().trim().toLowerCase().split(/\s+/).filter(Boolean);
    const found = this.items().filter((item) => {
      if (!words.length) return item.group === "Commands" || item.group === "Environments";
      const text = `${item.label} ${item.detail ?? ""} ${item.method ?? ""}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
    return GROUPS.map((name) => ({
      name,
      items: found
        .filter((item) => item.group === name)
        .slice(0, words.length || name !== "Commands" ? PER_GROUP : undefined),
    })).filter((group) => group.items.length);
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
