import type { HolderTarget } from "../state/tab-state";
import { Injectable, signal } from "@angular/core";
import type { VariableToken as ResolvedToken } from "@wayfarer/core";

/**
 * A variable of the request being composed; for one from an environment, which environment, and for one a collection
 * or a folder holds, which (U-132).
 */
export type VariableToken = ResolvedToken & {
  environmentId?: string;
  holder?: HolderTarget;
};

@Injectable({
  providedIn: "root",
})
export class VariableFocus {
  /**
   * The variable the user asked to see, until the environments editor shows
   * it. A signal, not an event: the editor is in a tab, made when the shell
   * opens it for this request.
   */
  readonly pending = signal<VariableToken | null>(null);

  requestFocus(token: VariableToken): void {
    this.pending.set({ ...token });
  }
}
