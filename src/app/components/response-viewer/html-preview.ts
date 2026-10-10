import { ChangeDetectionStrategy, Component, ElementRef, effect, input, viewChild } from "@angular/core";
import { previewDocument } from "@wayfarer/core";

/**
 * An HTML response, drawn and nothing more (plan D19). The frame's sandbox
 * has no `allow-*` token: no script, no form, no popup, and an origin of its
 * own. The document is a `blob:` URL, the only thing the app's `frame-src`
 * lets a frame show, and carries a policy that loads nothing from the
 * network. The frame's inline-document attribute would be simpler; it is a
 * Trusted Types sink, and the app's policy makes no HTML.
 */
@Component({
  selector: "app-html-preview",
  host: { class: "block" },
  // White whatever the theme: a page that sets no colours expects a white canvas.
  template: `<iframe #frame sandbox title="HTML preview" class="html-preview block h-[300px] w-full rounded-xl border border-separator bg-white"></iframe>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HtmlPreview {
  readonly html = input.required<string>();
  private readonly frame = viewChild.required<ElementRef<HTMLIFrameElement>>("frame");

  constructor() {
    effect((onCleanup) => {
      const url = URL.createObjectURL(new Blob([previewDocument(this.html())], { type: "text/html" }));
      // Set from code: a bound `src` needs a trusted resource URL, and there is none to give.
      this.frame().nativeElement.src = url;
      onCleanup(() => URL.revokeObjectURL(url));
    });
  }
}
