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

// D1.5's bake-off (prototype branch only): `?bakeoff=material|aria|platform`.
if (new URLSearchParams(location.search).has("bakeoff")) {
  void import("./bakeoff/page").then(({ BakeoffPage }) => bootstrapApplication(BakeoffPage, appConfig));
} else bootstrapApplication(App, appConfig)
  .then((app) => app.injector.get(SwUpdate).register())
  .catch((err) => console.error(err));
