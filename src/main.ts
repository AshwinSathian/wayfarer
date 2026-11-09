// Trusted Types (P1.9): the default policy is installed before bootstrap,
// so it is in place before any component touches a DOM script sink.
import { installTrustedTypesPolicy } from "./app/shared/security/trusted-types";
import { provideAppInitializer } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { App } from "./app/app";
import { appConfig } from "./app/app-config";
import { SwUpdate } from "./app/services/sw-update";
import { listenForCspViolations } from "./app/services/diagnostics";
import { takeShareFragment } from "./app/shared/share/link-at-start";
import { showBootFailure } from "./app/shared/boot-failure";
import { restoreTabsAtStart } from "./app/state/tabs-storage";

// A shared link (T1.3) leaves the address bar before anything else reads the address.
takeShareFragment();
installTrustedTypesPolicy();
listenForCspViolations();

// D3.3's widget catalogue, in development builds only: a production build
// defines ngDevMode as false, and drops this branch and the page with it.
if ((typeof ngDevMode === "undefined" || ngDevMode) && new URLSearchParams(location.search).has("catalogue")) {
  import("./app/catalogue/catalogue")
    .then(({ Catalogue }) => bootstrapApplication(Catalogue, appConfig))
    .catch((err) => console.error(err));
} else {
  // A failed start replaces the splash (index.html) with a line and Reload; a failed worker does not.
  // The tabs a reload or another browser tab left (P5.1) are read under the splash, before the first frame.
  bootstrapApplication(App, { providers: [...appConfig.providers, provideAppInitializer(restoreTabsAtStart)] })
    .then(
      (app) => app.injector.get(SwUpdate).register(),
      (err: unknown) => {
        console.error(err);
        const root = document.querySelector("app-root");
        if (root) showBootFailure(root);
      },
    )
    .catch((err) => console.error(err));
}
