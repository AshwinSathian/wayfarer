import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";
import { MASK, SENT_BODY_SHOWN, sentPart, type SentView } from "@wayfarer/core";

/** The Sent tab's content, drawn onto the `<div>` the tab pane holds (see `ResponseBody` for the selector). */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: "div[appResponseSent]",
  templateUrl: "./response-sent.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResponseSent {
  /** What history keeps of the send, masked: the only input, so the tab can show nothing the redactor left out. */
  readonly sent = input.required<SentView>();
  /** The region's name; the catalogue draws four at once and names each. */
  readonly label = input("What was sent");
  protected readonly words = sentPart;
  protected readonly bodyCut = SENT_BODY_SHOWN;
  /** The route's note: what a page cannot see of the request, or what the bridge adds. */
  protected readonly note = computed(() =>
    this.sent().route === "bridge" ? sentPart.bridgeAdds : sentPart.browserAdds,
  );
  /** A secret or a credential stood where `***` is: say so, in history's words. */
  protected readonly masked = computed(() => {
    const { address, headers, body, secrets } = this.sent();
    return (
      !!secrets?.length ||
      address.includes(MASK) ||
      headers.some((h) => h.value.includes(MASK)) ||
      !!body?.text.includes(MASK)
    );
  });
  protected readonly cutNote = computed(() => {
    const body = this.sent().body;
    return body && body.of > body.shown ? sentPart.cut(body.shown, body.of) : "";
  });
}
