import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app/app.component";
import { appConfig } from "./app/app.config";
import { SwUpdateService } from "./app/services/sw-update.service";

bootstrapApplication(AppComponent, appConfig)
  .then((app) => app.injector.get(SwUpdateService).register())
  .catch((err) => console.error(err));
