import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import {
  SHARE_LINK_MAX_BYTES,
  encodeShareLink,
  groupedCode,
  protectedSecretId,
  scriptsOf,
  shareFragment,
  type ShareLink,
} from "@wayfarer/core";
import { CollectionsStore } from "../../services/collections-store";
import { NOT_COPIED, writeToClipboard } from "../../shared/http/clipboard";
import { transientNote } from "../../shared/http/transient-note";
import { Icon } from "../../shared/icon/icon";
import { saveJsonFile } from "../../shared/save-file";
import { UiButton } from "../../ui/button";
import { UiCheckbox } from "../../ui/checkbox";
import { Dialog } from "../../ui/dialog";
import { UiInput } from "../../ui/input";
import { UiSegmented } from "../../ui/segmented";

type SendAs = "file" | "link";

/** "1 request", "3 folders": a count with its noun agreeing. */
const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
/** "a, b and c". */
const list = (items: string[]) =>
  items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : items[0];

/** How many text values of one file differ from the other's: the credentials that "Include credentials" puts in. */
function differences(a: unknown, b: unknown): number {
  if (typeof a === "string" || typeof b === "string") return a === b ? 0 : 1;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return 0;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  return Object.keys(left).reduce((sum, key) => sum + differences(left[key], right[key]), 0);
}

/**
 * Share… of a collection (T1.2, `docs/design/teams/share.md`, "File or link"): a copy as the app's own file, or as a
 * link that holds that file encrypted after its `#`. It says what goes, and where, before anything leaves: the file's
 * name, or the link's length. Credentials are masked unless "Include credentials" is ticked, as Export… has it.
 */
@Component({
  selector: "app-share-dialog",
  imports: [Dialog, FormsModule, Icon, UiButton, UiCheckbox, UiInput, UiSegmented],
  templateUrl: "./share-dialog.html",
  styleUrl: "./share-dialog.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareDialog {
  private readonly collections = inject(CollectionsStore);

  /** The collection to share. Null while the dialog is closed. */
  readonly collection = input<{ id: string; name: string } | null>(null);
  readonly closed = output<void>();

  protected readonly ways: { label: string; value: SendAs }[] = [
    { label: "File", value: "file" },
    { label: "Link", value: "link" },
  ];
  protected readonly sendAs = signal<SendAs>("file");
  protected readonly credentials = signal(false);
  protected readonly codeInLink = signal(false);
  /** The file as it would be written, with the choice of credentials made. */
  protected readonly json = signal<string | null>(null);
  /** How many credentials the masked file writes as ***. */
  protected readonly masked = signal(0);
  /** The link made of the file: a key of its own each time the file changes. */
  private readonly link = signal<ShareLink | null>(null);
  /** Make link was chosen: the link and its code are shown. */
  protected readonly made = signal(false);
  protected readonly saved = signal("");
  protected readonly copyStatus = transientNote();

  protected readonly fileName = computed(
    () => `${(this.collection()?.name ?? "collection").trim().replace(/\s+/g, "-").toLowerCase()}.wayfarer.json`,
  );

  /** What goes, from the collection as stored. */
  protected readonly summary = computed(() => {
    const id = this.collection()?.id;
    const tree = id ? this.collections.getCollectionTree(id) : undefined;
    if (!tree) return null;
    const holders = [tree.collection, ...tree.folders];
    const rows = holders.flatMap((holder) => holder.variables);
    const scripts = [...holders, ...tree.requests].flatMap((holder) => scriptsOf(holder)).length;
    const parts = [
      tree.requests.length ? count(tree.requests.length, "request") : "",
      tree.folders.length ? `in ${count(tree.folders.length, "folder")}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const facts = [parts, rows.length ? count(rows.length, "variable") : "", scripts ? count(scripts, "script") : ""];
    return {
      empty: !tree.requests.length,
      text: `${list(facts.filter(Boolean))}.`,
      protectedNames: [...new Set(rows.filter((row) => protectedSecretId(row.value)).map((row) => row.key))],
      scripts,
    };
  });

  /** The link's address: the app's own, with the fragment. Nothing after `#` is sent to a server. */
  protected readonly address = computed(() => {
    const link = this.link();
    if (!link) return "";
    const url = new URL(document.baseURI);
    url.search = "";
    url.hash = shareFragment(link, this.codeInLink());
    return url.href;
  });
  protected readonly code = computed(() => groupedCode(this.link()?.code ?? ""));
  protected readonly kilobytes = computed(() => Math.ceil(this.address().length / 1024));
  protected readonly tooLong = computed(() => this.address().length > SHARE_LINK_MAX_BYTES);
  protected readonly maxKilobytes = SHARE_LINK_MAX_BYTES / 1024;

  constructor() {
    // Each opening starts from the safe choice: a file, credentials masked, the code apart from the link.
    effect(() => {
      this.collection();
      this.sendAs.set("file");
      this.credentials.set(false);
      this.codeInLink.set(false);
      this.made.set(false);
      this.saved.set("");
    });
    effect(() => {
      const id = this.collection()?.id;
      const credentials = this.credentials();
      this.json.set(null);
      this.link.set(null);
      if (id) void this.read(id, credentials);
    });
  }

  private async read(id: string, credentials: boolean): Promise<void> {
    const [masked, plain] = await Promise.all([
      this.collections.exportCollectionJson(id),
      this.collections.exportCollectionJson(id, { credentials: true }),
    ]);
    if (this.collection()?.id !== id || this.credentials() !== credentials || !masked || !plain) return;
    this.masked.set(differences(JSON.parse(masked), JSON.parse(plain)));
    const json = credentials ? plain : masked;
    this.json.set(json);
    const link = await encodeShareLink(json);
    if (this.json() === json) this.link.set(link);
  }

  protected setCredentials(value: boolean): void {
    this.credentials.set(value);
    this.made.set(false);
    this.saved.set("");
  }

  protected saveFile(): void {
    const json = this.json();
    if (!json) return;
    saveJsonFile(this.fileName(), json);
    this.saved.set(`Saved ${this.fileName()}. The receiver opens it with Import › File….`);
  }

  protected async copy(what: "link" | "code"): Promise<void> {
    const text = what === "link" ? this.address() : (this.link()?.code ?? "");
    const copied = await writeToClipboard(text);
    this.copyStatus.show(
      !copied
        ? NOT_COPIED
        : what === "code"
          ? "Copied the code."
          : this.codeInLink()
            ? "Copied the link."
            : "Copied the link. Send the code another way.",
    );
  }

  protected plural = count;
  protected list = list;
}
