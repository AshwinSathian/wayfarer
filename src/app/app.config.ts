import { provideHttpClient, withXhr } from "@angular/common/http";
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from "@angular/core";
import { MAT_RIPPLE_GLOBAL_OPTIONS } from "@angular/material/core";
import { MAT_SELECT_CONFIG } from "@angular/material/select";

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(withXhr()),
    // No ink ripple: a control answers a press with its colour and scale.
    { provide: MAT_RIPPLE_GLOBAL_OPTIONS, useValue: { disabled: true } },
    // The chosen option is marked by its background, with no tick beside it.
    { provide: MAT_SELECT_CONFIG, useValue: { hideSingleSelectionIndicator: true } },
  ],
};
