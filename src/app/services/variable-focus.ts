import { Injectable, signal } from "@angular/core";
import type { VariableToken as ResolvedToken } from "@wayfarer/core";

/** A variable of the request being composed, and for one from an environment, which environment. */
export type VariableToken = ResolvedToken & { environmentId?: string };

@Injectable({
  providedIn: "root",
})
export class VariableFocus {
  /**
   * The variable the user asked to see, until the environments editor shows
   * it. A signal, not an event: the editor is a dialog, made when the shell
   * opens it for this request.
   */
  readonly pending = signal<VariableToken | null>(null);

  requestFocus(token: VariableToken): void {
    this.pending.set({ ...token });
  }
}
