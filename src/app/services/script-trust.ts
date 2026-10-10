import { Injectable, computed, effect, inject, signal } from "@angular/core";
import { scriptDigest, scriptsApproved, scriptsOf, type Ancestor, type RequestContent } from "@wayfarer/core";
import { CollectionsStore } from "./collections-store";
import { RequestSave } from "./request-save";

/** The scripts of one request, folder or collection, as the review lists them. */
export interface ReviewedScripts {
  /** What holds them. A history entry's are a request's. */
  kind: "collection" | "folder" | "request";
  name: string;
  pre: string;
  post: string;
}

type Scripts = RequestContent["scripts"];

/**
 * Decides whether the composer's scripts may run (plan D6, P3.8).
 *
 * - A request typed here, bound to nothing, runs its scripts.
 * - A saved request runs them, and those of its collection and its folders
 *   (P4.9), when its collection is trusted and holds the digest of each of
 *   them as it is stored. An imported or restored collection is not trusted
 *   until the user reviews its scripts.
 * - A history entry's scripts came from whatever was sent then; they run
 *   after the user has reviewed them, for as long as that entry is open.
 *
 * What is checked is the stored text the draft was loaded from, never the
 * draft: what the user then types into it is their own.
 */
@Injectable({ providedIn: "root" })
export class ScriptTrust {
  private readonly saved = inject(RequestSave);
  private readonly collections = inject(CollectionsStore);

  /** The scripts of the history entry in the composer, until they are reviewed. */
  private readonly fromHistory = signal<Scripts | null>(null);
  private readonly allowedState = signal(true);
  /** Whether the composer's scripts may run. Follows the bound request and its collection. */
  readonly allowed = this.allowedState.asReadonly();

  private readonly collection = computed(() => {
    const bound = this.saved.loadedCollectionRequest();
    return bound ? this.collections.tree().find((entry) => entry.collection.meta.id === bound.collectionId) : undefined;
  });

  /** What the review shows: every script of the bound request's collection, or the history entry's own. */
  readonly toReview = computed<ReviewedScripts[]>(() => {
    const history = this.fromHistory();
    if (history) return [{ kind: "request", name: "From history", ...history }];
    const tree = this.collection();
    if (!tree) return [];
    // In the order they run: the collection's, the folders', the requests'.
    const all: ReviewedScripts[] = [
      { kind: "collection", name: `Collection ${tree.collection.name}`, ...tree.collection.scripts },
      ...tree.folders.map((folder): ReviewedScripts => ({ kind: "folder", name: `Folder ${folder.name}`, ...folder.scripts })),
      ...tree.requests.map((request): ReviewedScripts => ({ kind: "request", name: request.name, ...request.scripts })),
    ];
    return all.filter((entry) => scriptsOf({ scripts: entry }).length);
  });

  constructor() {
    let latest = 0;
    effect(() => {
      // Read here, so the effect runs again when any of them changes.
      this.saved.loadedCollectionRequest();
      this.collection();
      this.saved.ancestors();
      this.fromHistory();
      const run = ++latest;
      void Promise.resolve(this.check()).then((allowed) => {
        if (run === latest) this.allowedState.set(allowed);
      });
    });
  }

  /**
   * Whether the composer's scripts may run, read from what is stored now.
   * `send` asks this, not the signal. A promise only when digests have to be
   * computed: a request without stored scripts is still sent in the same
   * task as the click.
   *
   * `inherited` is what the request's collection and folders hold for it:
   * `send` gives the very scripts it is about to run.
   */
  check(inherited: Ancestor[] = this.saved.ancestors()): boolean | Promise<boolean> {
    const bound = this.saved.loadedCollectionRequest();
    if (!bound) return this.fromHistory() === null;
    const scripts = [...inherited, bound].flatMap(scriptsOf);
    return scripts.length ? scriptsApproved(this.collection()?.collection.scriptTrust, scripts) : true;
  }

  /** A history entry was opened: its scripts wait for a review. */
  openedFromHistory(request: RequestContent): void {
    this.fromHistory.set(scriptsOf(request).length ? request.scripts : null);
  }

  /** A saved request was opened, or the composer was cleared. */
  openedHere(): void {
    this.fromHistory.set(null);
  }

  /** "I trust these scripts": approves exactly what `toReview` listed. */
  async approve(): Promise<void> {
    if (this.fromHistory()) {
      this.fromHistory.set(null);
      return;
    }
    const tree = this.collection();
    if (!tree) return;
    const digests = await Promise.all([tree.collection, ...tree.folders, ...tree.requests].flatMap(scriptsOf).map(scriptDigest));
    await this.collections.approveScripts(tree.collection.meta.id, [...new Set(digests)], true);
  }
}
