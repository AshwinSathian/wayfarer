import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from "@angular/core";
import { describeChange, type FileChange } from "@wayfarer/core";
import { Icon } from "../../shared/icon/icon";
import { CollectionFolders } from "../../services/collection-folders";
import { UiButton } from "../../ui/button";
import { Dialog } from "../../ui/dialog";

/** Marks a line of a diff with its sign, so it reads without colour. */
const SIGN = { same: " ", removed: "−", added: "+" } as const;

/**
 * "Keep in a folder…" of a collection (T2.2, T2.4; docs/design/git.md): the collection as plain files in a folder of
 * the user's repository. It says what is written and what is not, shows what changed in the folder from outside with
 * each file's diff, and hands the change to the import report on Take. Chromium's folder picker only.
 */
@Component({
  selector: "app-folder-dialog",
  imports: [Dialog, Icon, UiButton],
  templateUrl: "./folder-dialog.html",
  styleUrl: "./folder-dialog.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolderDialog {
  protected readonly folders = inject(CollectionFolders);

  /** The collection. Null while the dialog is closed. */
  readonly collection = input<{ id: string; name: string } | null>(null);
  readonly closed = output<void>();

  protected readonly status = computed(() => {
    const id = this.collection()?.id;
    return id ? this.folders.statusOf(id) : undefined;
  });
  protected readonly refused = signal("");
  /** What a screen reader hears when the folder's state changes: the region is in the page from the first render. */
  protected readonly announcement = computed(() => {
    const status = this.status();
    if (!status) return "";
    const named = `${status.folderName}: `;
    switch (status.state) {
      case "in-step":
        return `${named}the folder and this collection match.`;
      case "permission":
        return `${named}the browser asks again before Wayfarer may use the folder.`;
      case "problem":
        return `${named}the folder could not be read. ${status.problem ?? ""}`;
      case "both":
        return `${named}the folder and this collection both changed.`;
      case "outside":
        return `${named}the folder changed outside Wayfarer.`;
    }
  });
  protected readonly sign = SIGN;

  protected async choose(): Promise<void> {
    const id = this.collection()?.id;
    if (!id) return;
    this.refused.set((await this.folders.link(id)) ?? "");
  }

  protected async take(): Promise<void> {
    const id = this.collection()?.id;
    if (!id) return;
    const refused = await this.folders.take(id);
    if (refused) this.refused.set(refused);
    else this.closed.emit();
  }

  protected allow(): void {
    const id = this.collection()?.id;
    if (id) void this.folders.allow(id);
  }

  protected async stop(): Promise<void> {
    const id = this.collection()?.id;
    if (id) await this.folders.unlink(id);
  }

  protected changeLabel(status: "added" | "removed" | "changed"): string {
    return status === "added" ? "New in the folder" : status === "removed" ? "Gone from the folder" : "Changed";
  }

  /** What a changed file is called, for a person: "Request · List invoices", the path being the machine's. */
  protected describe(change: FileChange): string {
    const { kind, name } = describeChange(change);
    return `${kind} · ${name}`;
  }

  /** The dialog's title: what is asked before a folder is chosen, what is so after. */
  protected readonly title = computed(() => {
    const name = this.collection()?.name ?? "";
    const status = this.status();
    return status ? `${name} is kept in ${status.folderName}` : `Keep ${name} in a folder`;
  });
  protected readonly waiting = computed(() => {
    const state = this.status()?.state;
    return state === "outside" || state === "both";
  });
}
