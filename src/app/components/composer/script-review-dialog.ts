import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from "@angular/core";
import { scriptDigest, unsupportedApis } from "@wayfarer/core";
import { Icon } from "../../shared/icon/icon";
import { UiButton } from "../../ui/button";
import { ScriptTrust } from "../../services/script-trust";
import { Dialog } from "../../ui/dialog";

/**
 * Characters that draw nothing or reorder what is drawn: controls, bidirectional overrides and isolates, zero-width
 * marks. A script could hide code behind them from a reader (Trojan Source); Monaco showed them, a `<pre>` does not.
 */
// Every control but tab, a line feed and a CR before one, every format character, and every default-ignorable code
// point: the Hangul fillers, the variation selectors, the tag block and the rest, outside the Basic Multilingual
// Plane too. A lone CR, U+2028 and U+2029 end a line for JavaScript (and a // comment with it) but not on the screen.
const HIDDEN_CHARS = String.raw`(?!\t|\n|\r\n)[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}\p{Zl}\p{Zp}]`;
const HIDDEN = new RegExp(HIDDEN_CHARS, "u");

/** `text` with each hidden character written as its code point, so that what is read is what runs. */
function shown(text: string): string {
  return text.replace(
    new RegExp(HIDDEN_CHARS, "gu"),
    (char) => `⟨U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}⟩`,
  );
}

/**
 * Shows every script that is waiting for approval, read-only, and asks the
 * user to trust them (plan D6, P3.8). Each script is shown on its own, under
 * the name of its request, its folder or the collection: what is on screen
 * is the text that will run, in the order it runs.
 */
@Component({
  selector: "app-script-review-dialog",
  imports: [Dialog, Icon, UiButton],
  templateUrl: "./script-review-dialog.html",
  styles: `
    .script-review-code {
      margin: 0;
      max-height: 16rem;
      overflow: auto;
      padding: 10px 12px;
      border-radius: var(--radius-md);
      background: var(--canvas-panel);
      border: 1px solid var(--separator);
      font-family: var(--font-mono);
      font-size: var(--type-mono-body-size);
      line-height: var(--type-mono-body-line);
      white-space: pre;
      tab-size: 2;
      direction: ltr;
      unicode-bidi: isolate;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScriptReviewDialog {
  private readonly trust = inject(ScriptTrust);

  readonly visible = input(false);
  readonly visibleChange = output<boolean>();

  protected readonly saving = signal(false);
  protected readonly count = computed(() =>
    this.trust
      .toReview()
      .reduce((sum, request) => sum + (request.pre.trim() ? 1 : 0) + (request.post.trim() ? 1 : 0), 0),
  );
  /** Where the scripts are: "the collection, 1 folder and 2 requests". */
  protected readonly places = computed(() => {
    const count = (kind: string) => this.trust.toReview().filter((entry) => entry.kind === kind).length;
    const some = (kind: string) => (count(kind) ? [`${count(kind)} ${kind}${count(kind) === 1 ? "" : "s"}`] : []);
    const parts = [...(count("collection") ? ["the collection"] : []), ...some("folder"), ...some("request")];
    return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "");
  });
  protected readonly scripts = computed(() =>
    this.trust.toReview().flatMap((holder) =>
      (
        [
          ["Pre-request script", holder.pre],
          ["Post-response script", holder.post],
        ] as const
      )
        .filter(([, text]) => text.trim())
        .map(([kind, text]) => ({
          holder: holder.name,
          kind,
          text,
          shown: shown(text),
          hidden: HIDDEN.test(text),
          unsupported: unsupportedApis(text),
        })),
    ),
  );
  /** The places in `scripts` whose text the collection's last review did not cover: new, or changed since. */
  protected readonly unreviewed = signal<ReadonlySet<number>>(new Set());

  constructor() {
    effect((onCleanup) => {
      const scripts = this.scripts();
      const approved = this.trust.approvedDigests();
      let current = true;
      onCleanup(() => (current = false));
      void Promise.all(scripts.map((script) => scriptDigest(script.text))).then((digests) => {
        if (current) this.unreviewed.set(new Set(digests.flatMap((digest, i) => (approved.has(digest) ? [] : [i]))));
      });
    });
  }

  protected async approve(): Promise<void> {
    this.saving.set(true);
    try {
      await this.trust.approve();
      this.visibleChange.emit(false);
    } finally {
      this.saving.set(false);
    }
  }
}
