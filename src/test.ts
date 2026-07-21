// This file is required by karma.conf.js and loads the spec files for the suite.

// The production app runs zoneless (see app.config.ts's
// provideZonelessChangeDetection()) — zone.js is a test-only dependency here,
// used solely for TestBed's fakeAsync()/tick() helpers.
import 'zone.js';
import 'zone.js/testing';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting
} from '@angular/platform-browser-dynamic/testing';

getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
);

// Explicitly import spec files to avoid relying on deprecated require.context helpers.
import './app/app.component.spec';
import './app/components/api-params/api-params.component.spec';
import './app/components/past-requests/past-requests.component.spec';
import './app/data/idb.service.spec';
import './app/services/main.service.spec';
