import { JsonPipe } from "@angular/common";
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from "@angular/core";
import { empty, formatDuration } from "@wayfarer/core";
import { AiSettings } from "../../services/ai-settings";
import type { ExchangeView } from "../../state/exchange-view";
import { Icon } from "../../shared/icon/icon";
import { UiButton } from "../../ui/button";
import { AiTests } from "../ai-tests/ai-tests";

/** The Tests tab: each test's result, the scripts' times and what they wrote with `console`. */
@Component({
  selector: "app-response-tests",
  imports: [AiTests, Icon, JsonPipe, UiButton],
  host: { class: "block space-y-2 pb-4" },
  templateUrl: "./response-tests.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResponseTests {
  protected readonly ai = inject(AiSettings);
  readonly exchange = input.required<ExchangeView>();
  /** The empty line's button: the request's Scripts tab, which the composer holds (U-202). */
  readonly openScripts = output<void>();
  /** The scripts did not run (not reviewed): the tab says so, with the way to review them. */
  protected readonly held = empty.testsHeld;
  protected readonly testPassCount = computed(() => this.exchange().testResults.filter((r) => r.passed).length);
  protected readonly testFailCount = computed(() => this.exchange().testResults.filter((r) => !r.passed).length);
  /** How long the scripts and the request took, each by itself; shown when a script ran. */
  protected readonly scriptTimings = computed(() => {
    const { preScriptMs, requestMs, postScriptMs } = this.exchange().timings ?? {};
    if (preScriptMs === undefined && postScriptMs === undefined) return "";
    const parts: [string, number | undefined][] = [
      ["Pre-request script", preScriptMs],
      ["Request", requestMs],
      ["Post-response script", postScriptMs],
    ];
    return parts
      .filter(([, ms]) => ms !== undefined)
      .map(([name, ms]) => `${name} ${formatDuration(ms)}`)
      .join(" · ");
  });
}
