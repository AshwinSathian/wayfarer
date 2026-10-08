// Trusted Types (P1.9): the default policy is installed before bootstrap,
// so it is in place before any component touches a DOM script sink.
import { installTrustedTypesPolicy } from "./app/shared/security/trusted-types";
import { bootstrapApplication } from "@angular/platform-browser";
import { App } from "./app/app";
import { appConfig } from "./app/app.config";
import { SwUpdate } from "./app/services/sw-update";

installTrustedTypesPolicy();

bootstrapApplication(App, appConfig)
  .then((app) => app.injector.get(SwUpdate).register())
  .catch((err) => console.error(err));
