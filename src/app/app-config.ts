import {
  ApplicationConfig,
  ErrorHandler,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from "@angular/core";
import { RecordingErrorHandler } from "./services/diagnostics";

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // What went wrong is kept for Settings → Diagnostics (P7.3).
    { provide: ErrorHandler, useClass: RecordingErrorHandler },
    provideZonelessChangeDetection(),
  ],
};
