import { Injectable, computed, effect, inject, signal } from "@angular/core";
import {
  FolderError,
  MAX_FOLDER_DEPTH,
  MAX_FOLDER_FILES,
  changedFiles,
  isFolderPath,
  keepCredentialsHere,
  readFolder,
  serializeDeterministic,
  writeFolder,
  type CollectionExport,
  type FileChange,
} from "@wayfarer/core";
import { SharesRepository } from "../data/shares-repository";
import type { Share } from "../data/idb-schema";
import { CollectionsStore } from "./collections-store";
import { recordDiagnostic } from "./diagnostics";
import { ImportPipeline } from "./import-pipeline";

/** Where a collection kept in a folder stands against the folder (T2.4). */
export type FolderState =
  /** The folder is as the app last left it. */
  | "in-step"
  /** Something changed in the folder from outside (a `git pull`, an editor). */
  | "outside"
  /** The folder changed from outside and so did the collection here. */
  | "both"
  /** The browser must be asked again for the folder. */
  | "permission"
  /** The folder cannot be read, or holds files the format does not read. */
  | "problem";

export interface FolderStatus {
  collectionId: string;
  folderName: string;
  state: FolderState;
  /** What changed in the folder, for `outside` and `both`. */
  changes: FileChange[];
  /** Why a folder cannot be read. */
  problem?: string;
}

const CHECK_EVERY_MS = 5_000;
const WRITE_AFTER_MS = 1_000;

/**
 * Collections kept as files in a folder of the user's disk (T2.2, T2.4; docs/design/git.md). Chromium's folder picker
 * only. The app writes the folder when the collection here changes and the folder has not; a change from outside
 * (a `git pull`) is shown with its diff and taken only on a yes, through the import report like any file. Wayfarer runs
 * no Git command: the user commits, pulls and branches with their own.
 */
@Injectable({ providedIn: "root" })
export class CollectionFolders {
  private readonly repository = inject(SharesRepository);
  private readonly collections = inject(CollectionsStore);
  private readonly imports = inject(ImportPipeline);

  /** Whether this browser can keep a collection in a folder. */
  readonly supported = typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

  private readonly state = signal<FolderStatus[]>([]);
  readonly statuses = this.state.asReadonly();
  /** The collections the folder has changes for, for the sidebar to say. */
  readonly waiting = computed(() => this.state().filter((s) => s.state === "outside" || s.state === "both"));
  private shares: Share[] = [];
  private running = false;
  private again = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    if (!this.supported) return;
    void this.load();
    setInterval(() => {
      if (document.visibilityState === "visible") void this.check();
    }, CHECK_EVERY_MS);
    window.addEventListener("focus", () => void this.check());
    // A change to a collection here, written to its folder a moment after the last one.
    effect(() => {
      this.collections.tree();
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.check(), WRITE_AFTER_MS);
    });
  }

  statusOf(collectionId: string): FolderStatus | undefined {
    return this.state().find((s) => s.collectionId === collectionId);
  }

  /** Asks for a folder and keeps the collection in it. The folder must hold no collection already. */
  async link(collectionId: string): Promise<string | null> {
    const folder = await this.pick();
    if (!folder) return null;
    const files = await this.read(folder);
    if (Object.keys(files).length) return `${folder.name} already holds a collection. Open it from Import › Folder…`;
    const local = await this.localFiles(collectionId);
    if (!local) return "The collection is gone.";
    await this.write(folder, {}, local);
    await this.repository.keep({ collectionId, folder }, { collectionId, files: local });
    await this.load();
    await this.check();
    return null;
  }

  /** Asks for a folder that holds a collection, and opens it in the import report; the report's Import keeps it there. */
  async openFolder(): Promise<string | null> {
    const folder = await this.pick();
    if (!folder) return null;
    const files = await this.read(folder);
    if (!Object.keys(files).length) return `${folder.name} holds no collection.`;
    const payload = this.parse(files);
    if (typeof payload === "string") return payload;
    const id = payload.collection.meta.id;
    await this.imports.stage(folder.name, serializeDeterministic(payload), async () => {
      await this.repository.keep({ collectionId: id, folder }, { collectionId: id, files });
      await this.load();
    });
    return null;
  }

  /** Opens the folder's changes in the import report; its Import takes them, and the folder's state is then the base. */
  async take(collectionId: string): Promise<string | null> {
    const share = this.shares.find((s) => s.collectionId === collectionId);
    if (!share) return null;
    const files = await this.read(share.folder);
    const taken = this.parse(files);
    if (typeof taken === "string") return taken;
    const here = await this.localExport(collectionId);
    const payload = here ? keepCredentialsHere(taken, here) : taken;
    await this.imports.stage(share.folder.name, serializeDeterministic(payload), async () => {
      await this.repository.putBase({ collectionId, files });
      await this.check();
    });
    return null;
  }

  /** The browser's own prompt, to read and write the folder again. Needs a click. */
  async allow(collectionId: string): Promise<void> {
    const share = this.shares.find((s) => s.collectionId === collectionId);
    if (!share) return;
    await share.folder.requestPermission({ mode: "readwrite" });
    await this.check();
  }

  /** The collection stays; the folder and what it holds are left alone. */
  async unlink(collectionId: string): Promise<void> {
    await this.repository.remove(collectionId);
    await this.load();
  }

  private async load(): Promise<void> {
    this.shares = await this.repository.shares();
    await this.check();
  }

  /** One pass over every kept collection: write what changed here, or find what changed in the folder. */
  async check(): Promise<void> {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      const next: FolderStatus[] = [];
      for (const share of this.shares) next.push(await this.checkOne(share));
      this.state.set(next);
    } finally {
      this.running = false;
    }
    if (this.again) {
      this.again = false;
      await this.check();
    }
  }

  private async checkOne(share: Share): Promise<FolderStatus> {
    const status = (state: FolderState, extra: Partial<FolderStatus> = {}): FolderStatus => ({
      collectionId: share.collectionId,
      folderName: share.folder.name,
      state,
      changes: [],
      ...extra,
    });
    try {
      if ((await share.folder.queryPermission({ mode: "readwrite" })) !== "granted") return status("permission");
      const base = (await this.repository.base(share.collectionId))?.files ?? {};
      const files = await this.read(share.folder);
      const local = await this.localFiles(share.collectionId);
      if (!local) {
        // The collection was deleted here.
        await this.repository.remove(share.collectionId);
        this.shares = this.shares.filter((s) => s !== share);
        return status("in-step");
      }
      const outside = changedFiles(base, files);
      const mine = changedFiles(base, local);
      if (!changedFiles(local, files).length) {
        if (mine.length) await this.repository.putBase({ collectionId: share.collectionId, files: local });
        return status("in-step");
      }
      if (outside.length) return status(mine.length ? "both" : "outside", { changes: outside });
      await this.write(share.folder, files, local);
      await this.repository.putBase({ collectionId: share.collectionId, files: local });
      return status("in-step");
    } catch (error) {
      recordDiagnostic(error, "folder: could not check");
      return status("problem", { problem: error instanceof Error ? error.message : "The folder could not be read." });
    }
  }

  private async pick(): Promise<FileSystemDirectoryHandle | null> {
    try {
      return (await window.showDirectoryPicker?.({ mode: "readwrite", id: "wayfarer-collection" })) ?? null;
    } catch (error) {
      // The person closed the picker.
      if (error instanceof DOMException && error.name === "AbortError") return null;
      throw error;
    }
  }

  private parse(files: Record<string, string>): CollectionExport | string {
    try {
      return readFolder(files);
    } catch (error) {
      if (error instanceof FolderError) return error.problems.join("\n");
      throw error;
    }
  }

  private async localExport(collectionId: string): Promise<CollectionExport | null> {
    const text = await this.collections.exportCollectionJson(collectionId);
    // The app's own export, just written by `exportCollectionJson`.
    return text ? (JSON.parse(text) as CollectionExport) : null;
  }

  private async localFiles(collectionId: string): Promise<Record<string, string> | null> {
    const exported = await this.localExport(collectionId);
    return exported && writeFolder(exported);
  }

  /** The files of the format in a folder, by path; whatever else is there (`.git`, notes) is not read. */
  private async read(folder: FileSystemDirectoryHandle): Promise<Record<string, string>> {
    const files: Record<string, string> = {};
    let seen = 0;
    const walk = async (dir: FileSystemDirectoryHandle, prefix: string, depth: number): Promise<void> => {
      for await (const [name, handle] of dir.entries()) {
        if (name.startsWith(".")) continue;
        if (++seen > MAX_FOLDER_FILES) throw new Error(`The folder holds more than ${MAX_FOLDER_FILES} files.`);
        const path = `${prefix}${name}`;
        if (handle.kind === "directory") {
          if (depth < MAX_FOLDER_DEPTH) await walk(handle as FileSystemDirectoryHandle, `${path}/`, depth + 1);
        } else if (isFolderPath(path)) {
          files[path] = await (await (handle as FileSystemFileHandle).getFile()).text();
        }
      }
    };
    await walk(folder, "", 0);
    return files;
  }

  /** Makes the folder hold `to`: writes the files that differ and removes those that are gone. */
  private async write(
    folder: FileSystemDirectoryHandle,
    from: Record<string, string>,
    to: Record<string, string>,
  ): Promise<void> {
    for (const change of changedFiles(from, to)) {
      const parts = change.path.split("/");
      const name = parts.pop() as string;
      let dir = folder;
      const dirs = [folder];
      for (const part of parts) {
        dir = await dir.getDirectoryHandle(part, { create: change.status !== "removed" });
        dirs.push(dir);
      }
      if (change.status === "removed") {
        await dir.removeEntry(name);
        // A folder this leaves empty goes too, innermost first.
        for (let i = dirs.length - 1; i > 0; i--) {
          if (!(await dirs[i].keys().next()).done) break;
          await dirs[i - 1].removeEntry(parts[i - 1]);
        }
        continue;
      }
      const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await writable.write(to[change.path]);
      await writable.close();
    }
  }
}
