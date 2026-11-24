import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from "@angular/core";
import { addressProblem, scriptsOf, strip, stripView, type AddressProblem, type StripInput } from "@wayfarer/core";
import { BridgeSettings } from "../../services/bridge-settings";
import { EnvironmentsStore } from "../../services/environments-store";
import { RequestSettings } from "../../services/request-settings";
import { RequestSave } from "../../services/request-save";
import { SocketClient } from "../../services/socket-client";
import { WorkspaceStore } from "../../state/workspace-store";
import { Icon } from "../../shared/icon/icon";
import { UiButton } from "../../ui/button";

/** Nothing moves for a reply that comes sooner (D3.7): the response is there before the eye looks for a sign of it. */
const RUN_AFTER_MS = 150;

/** A state of the strip drawn as given, for the catalogue: it reads no store. */
export interface StripPreset {
  input: StripInput;
  problem?: AddressProblem | null;
  running?: boolean;
}

/**
 * The route strip (overhaul S4a): where the request will leave from, which host it goes to and which secrets it
 * names, drawn as a path (an origin, a block on the line when a secret is named, the host) in the shape of the mark.
 * After a send it says what the send did: the route taken and the secrets sent, masked where they are kept.
 * Under it one line is always reserved: the problem (a missing variable, a bad address) or what else the request
 * has, so that a problem moves nothing. The whole strip is one string to a screen reader.
 */
@Component({
  selector: "app-route-strip",
  imports: [Icon, UiButton],
  templateUrl: "./route-strip.html",
  styleUrl: "./route-strip.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "route-strip block", "[class.is-compact]": "compact()", "[class.is-running]": "running()" },
})
export class RouteStrip {
  private readonly store = inject(WorkspaceStore);
  private readonly saved = inject(RequestSave);
  private readonly bridge = inject(BridgeSettings);
  private readonly environments = inject(EnvironmentsStore);
  private readonly settings = inject(RequestSettings);
  private readonly socket = inject(SocketClient);

  /** The composer's own box is too narrow for the path beside its words (`Composer.compact`). */
  readonly compact = input(false);
  /** "Send anyway", offered for the variables that held the last send back. */
  readonly sendAnyway = output<void>();

  /** The catalogue's states: when given, the strip is drawn from it and not from the open tab. */
  readonly preset = input<StripPreset | null>(null);

  protected readonly open = signal(false);
  private readonly slow = signal(false);
  protected readonly running = computed(() => this.preset()?.running ?? this.slow());
  protected readonly sendAnywayLabel = strip.sendAnyway;

  /** The address is one the request can go to: a WebSocket's is any `ws:` or `wss:` address the page can read. */
  private readonly valid = computed(() => (this.socket.isSocket() ? !!this.socket.host() : this.store.addressValid()));
  /** The host the address goes to, as the preview has it: "" for an address that is not one. */
  private readonly host = computed(() => {
    if (!this.valid()) return "";
    return this.socket.isSocket() ? this.socket.host() : (URL.parse(this.store.previewAddress())?.host ?? "");
  });
  private readonly variables = this.store.previewVariables;
  /** Names the request refers to in the vault: a variable that holds one, or a reference as written. Never read. */
  private readonly secretNames = computed(() => [
    ...new Set(
      this.variables()
        .filter((variable) => variable.source === "secret" || variable.vaulted)
        .map((variable) => variable.name.replace(/^\$secret\./, "")),
    ),
  ]);

  protected readonly view = computed(() => {
    const preset = this.preset();
    if (preset) return stripView(preset.input);
    const record = this.store.responseRecord();
    const host = this.host();
    const draft = this.store.draft();
    const own = this.variables().filter((variable) => variable.source !== "secret" && !variable.vaulted).length;
    return stripView({
      route: this.store.route(),
      paired: this.bridge.paired(),
      socket: this.socket.isSocket(),
      method: draft.method,
      host,
      secrets: this.secretNames(),
      variables: own,
      scripts: {
        count: [...this.saved.ancestors(), draft].flatMap(scriptsOf).length,
        held: this.store.scriptsHeld(),
      },
      // What the last send did, while it is still this request: not while one is on its way, not for another host.
      record: record && !this.store.loadingState() && record.host === host ? record : undefined,
    });
  });

  /** What is wrong, said once, in the reserved line. A refused send's own sentence first. */
  protected readonly problem = computed(() => {
    const preset = this.preset();
    if (preset) return preset.problem ?? null;
    const refused = this.store.endpointError();
    if (refused) return { kind: "address" as const, text: refused };
    const missing = this.variables()
      .filter((variable) => variable.source === "missing")
      .map((variable) => variable.name);
    return addressProblem(this.store.draft().url, this.valid(), missing, this.environments.activeEnvironment()?.name);
  });
  protected readonly blocked = computed(() => (this.preset() ? [] : this.store.unresolvedBlocked()));

  constructor() {
    // The segment runs along the line only for a send that takes longer than RUN_AFTER_MS, and stops at the
    // request's timeout, if it has one: a loop that ends (CLAUDE.md, Styling).
    effect((onCleanup) => {
      if (!this.store.loadingState()) {
        this.slow.set(false);
        return;
      }
      const timers = [setTimeout(() => this.slow.set(true), RUN_AFTER_MS)];
      const timeout = this.settings.timeoutMs();
      if (timeout > RUN_AFTER_MS) timers.push(setTimeout(() => this.slow.set(false), timeout));
      onCleanup(() => timers.forEach(clearTimeout));
    });
  }
}
