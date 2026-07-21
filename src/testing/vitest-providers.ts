import { provideZonelessChangeDetection } from "@angular/core";

/**
 * Global TestBed providers for the Vitest unit-test builder
 * (angular.json's "test" architect target -> "providersFile"). The app
 * itself runs zoneless (see app.config.ts) and zone.js was removed from the
 * production polyfills bundle — TestBed needs the same explicit opt-in
 * (Angular throws NG0908 otherwise), since it bootstraps each spec's own
 * testing module independently of main.ts's real appConfig.
 */
export default [provideZonelessChangeDetection()];
