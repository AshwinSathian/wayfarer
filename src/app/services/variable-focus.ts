import { Injectable } from "@angular/core";
import { Subject } from "rxjs";
import type { VariableToken as ResolvedToken } from "@wayfarer/core";

/** A variable of the request being composed, and for one from an environment, which environment. */
export type VariableToken = ResolvedToken & { environmentId?: string };

@Injectable({
  providedIn: "root",
})
export class VariableFocus {
  private readonly focusRequests = new Subject<VariableToken>();
  readonly focus$ = this.focusRequests.asObservable();

  requestFocus(token: VariableToken): void {
    this.focusRequests.next(token);
  }
}
