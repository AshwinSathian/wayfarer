// Trusted Types (P1.9): the default policy is installed before bootstrap,
// so it is in place before any component touches a DOM script sink.
import { installTrustedTypesPolicy } from "./app/shared/security/trusted-types";
import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app/app.component";
import { appConfig } from "./app/app.config";
import { SwUpdateService } from "./app/services/sw-update.service";

installTrustedTypesPolicy();

bootstrapApplication(AppComponent, appConfig)
  .then((app) => app.injector.get(SwUpdateService).register())
  .catch((err) => console.error(err));
