import { Injectable, computed, signal, type Signal, type WritableSignal } from "@angular/core";
import { TabState } from "./tab-state";

/** A signal of the open tab's, read and written as if it were one signal. */
export type Forwarded<T> = Signal<T> & Pick<WritableSignal<T>, "set" | "update">;

/** The signal `pick` gives for the tab that is open now: a read follows a change of tab, a write goes to the open tab. */
export function forwarded<T>(pick: () => WritableSignal<T>): Forwarded<T> {
  return Object.assign(
    computed(() => pick()()),
    {
      set: (value: T) => pick().set(value),
      update: (change: (value: T) => T) => pick().update(change),
    }
  );
}

/** The composer's tabs (P5.1) and which of them is open. There is always one. */
@Injectable({ providedIn: "root" })
export class Tabs {
  private readonly list = signal<TabState[]>([new TabState()]);
  readonly tabs = this.list.asReadonly();
  private readonly activeId = signal(this.list()[0].id);
  readonly active = computed(() => this.list().find((tab) => tab.id === this.activeId()) ?? this.list()[0]);

  /** Opens `tab` (a new, empty one unless given) after the open tab. */
  open(tab = new TabState()): void {
    const at = this.list().indexOf(this.active()) + 1;
    this.list.update((tabs) => [...tabs.slice(0, at), tab, ...tabs.slice(at)]);
    this.activeId.set(tab.id);
  }

  activate(id: string): void {
    this.activeId.set(id);
  }

  /**
   * The tabs as they are stored (P5.1), in place of the ones here. `open`
   * stays the open tab when it is among them; otherwise the first is.
   */
  replace(tabs: TabState[], open = this.activeId()): void {
    if (!tabs.length) return;
    this.list.set(tabs);
    this.activeId.set(tabs.some((tab) => tab.id === open) ? open : tabs[0].id);
  }

  /**
   * Closes a tab, and gives up on the request it has on its way. The one after
   * it becomes the open one, or the one before; the last tab is replaced by an empty one.
   */
  close(id: string): void {
    const tabs = this.list();
    const at = tabs.findIndex((tab) => tab.id === id);
    if (at < 0) return;
    tabs[at].inFlight?.abort();
    const rest = tabs.filter((tab) => tab.id !== id);
    if (!rest.length) rest.push(new TabState());
    this.list.set(rest);
    if (this.activeId() === id) this.activeId.set(rest[Math.min(at, rest.length - 1)].id);
  }
}
