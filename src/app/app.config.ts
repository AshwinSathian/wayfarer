import {
  provideHttpClient,
  withInterceptorsFromDi,
  withXhr
} from "@angular/common/http";
import { ApplicationConfig, provideZonelessChangeDetection } from "@angular/core";

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideHttpClient(withXhr(), withInterceptorsFromDi()),
  ],
};
