import {
  ApplicationConfig,
  ErrorHandler,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from "@angular/core";
import { MAT_RIPPLE_GLOBAL_OPTIONS } from "@angular/material/core";
import { RecordingErrorHandler } from "./services/diagnostics";

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // What went wrong is kept for Settings → Diagnostics (P7.3).
    { provide: ErrorHandler, useClass: RecordingErrorHandler },
    provideZonelessChangeDetection(),
    // No ink ripple: a control answers a press with its colour and scale.
    { provide: MAT_RIPPLE_GLOBAL_OPTIONS, useValue: { disabled: true } },
  ],
};
