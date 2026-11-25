/**
 * Where a jump goes (BB2): each is found in the page by its own class, the first that is there, and given focus. A
 * place that is not on the page (no variables, no response) takes nothing and gives focus nowhere.
 */
function focusFirst(...selectors: string[]): boolean {
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);
    if (element && !element.closest("[inert]")) {
      element.focus();
      return element === document.activeElement;
    }
  }
  return false;
}

/** The response's chosen tab, else the response itself. */
export const focusResponse = () =>
  focusFirst(
    'app-response-viewer .response-tabs [role="tab"][aria-selected="true"]',
    "app-response-viewer .response-main",
  );

/** The first variable of the request, whose popover is one Enter away. */
export const focusVariables = () => focusFirst("app-variable-chips .var-chip");

/** The strip's offer if it makes one, else its fold button, else the strip itself, which reads as one sentence. */
export const focusStrip = () =>
  focusFirst("app-route-strip .route-problem button", "app-route-strip .route-toggle", "app-route-strip .route-wide");

/** The strip's fold button, when the strip is folded (a narrow composer): pressing it shows or hides the rest. */
export function stripFold(): HTMLElement | null {
  return document.querySelector<HTMLElement>("app-route-strip .route-toggle");
}

/** The strip's offer (Send anyway, Import it as a request): its button, when there is one. */
export function stripOffer(): HTMLElement | null {
  return document.querySelector<HTMLElement>("app-route-strip .route-problem button");
}
