import { Injectable } from "@angular/core";
import { Subject } from "rxjs";
import { VariableToken } from "../shared/environments/env-resolution";

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
