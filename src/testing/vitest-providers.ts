import { provideZonelessChangeDetection } from "@angular/core";

/**
 * Global TestBed providers for the Vitest unit-test builder
 * (angular.json's "test" architect target -> "providersFile"). The app
 * itself runs zoneless (see app.config.ts) and loads no zone patch, so
 * TestBed gets the same explicit provider: it bootstraps each spec's own
 * testing module independently of main.ts's real appConfig.
 */
export default [provideZonelessChangeDetection()];
