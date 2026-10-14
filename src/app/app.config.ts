import {
  ApplicationConfig,
  ErrorHandler,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from "@angular/core";
import { MAT_RIPPLE_GLOBAL_OPTIONS } from "@angular/material/core";
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from "@angular/material/form-field";
import { MAT_SELECT_CONFIG } from "@angular/material/select";
import { RecordingErrorHandler } from "./services/diagnostics";

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // What went wrong is kept for Settings → Diagnostics (P7.3).
    { provide: ErrorHandler, useClass: RecordingErrorHandler },
    provideZonelessChangeDetection(),
    // No ink ripple: a control answers a press with its colour and scale.
    { provide: MAT_RIPPLE_GLOBAL_OPTIONS, useValue: { disabled: true } },
    // The chosen option is marked by its background, with no tick beside it.
    // A bordered box with its label outside it, and no room kept under it for a hint.
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: "outline", subscriptSizing: "dynamic" } },
    { provide: MAT_SELECT_CONFIG, useValue: { hideSingleSelectionIndicator: true } },
  ],
};
