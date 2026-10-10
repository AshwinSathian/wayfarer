import { Injectable, computed, effect, inject, signal } from "@angular/core";
import { scriptDigest, scriptsApproved, scriptsOf, type RequestContent } from "@wayfarer/core";
import { CollectionsStore } from "./collections-store";
import { RequestSave } from "./request-save";

/** One request's scripts, as the review lists them. */
export interface ReviewedScripts {
  name: string;
  pre: string;
  post: string;
}

type Scripts = RequestContent["scripts"];

/**
 * Decides whether the composer's scripts may run (plan D6, P3.8).
 *
 * - A request typed here, bound to nothing, runs its scripts.
 * - A saved request runs them when its collection is trusted and holds the
 *   digest of each script as it is stored. An imported or restored
 *   collection is not trusted until the user reviews its scripts.
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
    if (history) return [{ name: "From history", ...history }];
    return (this.collection()?.requests ?? []).filter((request) => scriptsOf(request).length).map((request) => ({ name: request.name, ...request.scripts }));
  });

  constructor() {
    let latest = 0;
    effect(() => {
      // Read here, so the effect runs again when any of them changes.
      this.saved.loadedCollectionRequest();
      this.collection();
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
   */
  check(): boolean | Promise<boolean> {
    const bound = this.saved.loadedCollectionRequest();
    if (!bound) return this.fromHistory() === null;
    const scripts = scriptsOf(bound);
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
    const digests = await Promise.all(tree.requests.flatMap(scriptsOf).map(scriptDigest));
    await this.collections.approveScripts(tree.collection.meta.id, [...new Set(digests)], true);
  }
}
