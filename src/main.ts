// Trusted Types (P1.9): the default policy is installed before bootstrap,
// so it is in place before any component touches a DOM script sink.
import { installTrustedTypesPolicy } from "./app/shared/security/trusted-types";
import { bootstrapApplication } from "@angular/platform-browser";
import { App } from "./app/app";
import { appConfig } from "./app/app.config";
import { SwUpdate } from "./app/services/sw-update";
import { listenForCspViolations } from "./app/services/diagnostics";

installTrustedTypesPolicy();
listenForCspViolations();

// D3.3's widget catalogue, in development builds only: a production build
// defines ngDevMode as false, and drops this branch and the page with it.
if ((typeof ngDevMode === "undefined" || ngDevMode) && new URLSearchParams(location.search).has("catalogue")) {
  import("./app/catalogue/catalogue")
    .then(({ Catalogue }) => bootstrapApplication(Catalogue, appConfig))
    .catch((err) => console.error(err));
} else {
  bootstrapApplication(App, appConfig)
    .then((app) => app.injector.get(SwUpdate).register())
    .catch((err) => console.error(err));
}
