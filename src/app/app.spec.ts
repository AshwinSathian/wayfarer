import { provideHttpClient, withXhr } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { App } from './app';
import { Idb } from './data/idb';
import { PastRequest } from './models/history';
import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";

class IdbServiceMock {
  init = vi.fn().mockReturnValue(Promise.resolve());
  getLatest = vi.fn().mockReturnValue(Promise.resolve([] as PastRequest[]));
  clear = vi.fn().mockReturnValue(Promise.resolve());
  delete = vi.fn().mockReturnValue(Promise.resolve());
  // AppShell.ngOnInit() calls EnvironmentsStore.ensureLoaded() and
  // SecretsVault.hasAnySecrets(), both of which round-trip through Idb.
  listEnvironments = vi.fn().mockReturnValue(Promise.resolve([]));
  getActiveEnvironmentId = vi.fn().mockReturnValue(Promise.resolve(null));
  setActiveEnvironment = vi.fn().mockReturnValue(Promise.resolve());
  peekSecretEnvelope = vi.fn().mockReturnValue(Promise.resolve(null));
  listCollections = vi.fn().mockReturnValue(Promise.resolve([]));
  readonly closedByOtherTab = signal(false).asReadonly();
  readonly memoryOnly = signal(false).asReadonly();
}

describe('App', () => {
  let fixture: ComponentFixture<App>;
  let component: App;
  let idbService: IdbServiceMock;

  beforeEach(async () => {
    idbService = new IdbServiceMock();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(withXhr()),
        { provide: Idb, useValue: idbService },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    Reflect.deleteProperty(window, "innerWidth");
  });

  it('should create the app', () => {
    fixture = TestBed.createComponent(App);
    component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('loads history on init', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    const history: PastRequest[] = [{
      id: 1,
      method: 'GET',
      url: 'https://example.com/api',
      headers: {},
      createdAt: 1
    }];
    idbService.getLatest.mockReturnValue(Promise.resolve(history));

    fixture = TestBed.createComponent(App);
    component = fixture.componentInstance;
    fixture.detectChanges();

    // ngOnInit() kicks off an unawaited async chain (init() -> getLatest()),
    // so fixture.whenStable() alone isn't guaranteed to wait for it under
    // zoneless change detection (there's no NgZone tracking bare promises
    // anymore) - poll until the signal settles instead.
    await vi.waitFor(() => {
      expect(component.pastRequests()).toEqual(history);
    });

    expect(idbService.init).toHaveBeenCalled();
    expect(component.historyLoading()).toBe(false);
  });

  it('clears history via the service', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    const history: PastRequest[] = [{ id: 1, method: 'GET', url: 'https://example.com', headers: {}, createdAt: 1 }];
    idbService.getLatest.mockReturnValue(Promise.resolve(history));

    fixture = TestBed.createComponent(App);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    idbService.getLatest.mockReturnValue(Promise.resolve([]));

    await component.clearPastRequests();
    await fixture.whenStable();

    expect(idbService.clear).toHaveBeenCalled();
    expect(component.pastRequests()).toEqual([]);
  });

  it('deletes history entries', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    const history: PastRequest[] = [{ id: 5, method: 'GET', url: 'https://delete.me', headers: {}, createdAt: 1 }];
    idbService.getLatest.mockReturnValue(Promise.resolve(history));

    fixture = TestBed.createComponent(App);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    idbService.getLatest.mockReturnValue(Promise.resolve([]));

    await component.deletePastRequest(5);
    await fixture.whenStable();

    expect(idbService.delete).toHaveBeenCalledWith(5);
    expect(component.pastRequests()).toEqual([]);
  });

  it('controls drawer visibility state', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    idbService.getLatest.mockReturnValue(Promise.resolve([]));

    fixture = TestBed.createComponent(App);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.drawerVisible()).toBe(true);
    component.toggleHistoryDrawer();
    expect(component.drawerVisible()).toBe(false);
    component.openHistoryDrawer();
    expect(component.drawerVisible()).toBe(true);
    component.closeHistoryDrawer();
    expect(component.drawerVisible()).toBe(false);
  });

  it('pins the sidebar open from 1024 px, and keeps it a closed drawer below that; the stacked composer starts below 768 px', async () => {
    idbService.getLatest.mockReturnValue(Promise.resolve([]));
    const at = async (width: number) => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      fixture = TestBed.createComponent(App);
      component = fixture.componentInstance;
      fixture.detectChanges();
      await fixture.whenStable();
      return { drawer: component.drawerVisible(), overlay: component.sidebarOverlay(), mobile: component.isMobile() };
    };

    expect(await at(1024)).toEqual({ drawer: true, overlay: false, mobile: false });
    // A tablet, or a small laptop window: room for the two composer panes, not for a 352 px sidebar beside them.
    expect(await at(1023)).toEqual({ drawer: false, overlay: true, mobile: false });
    expect(await at(768)).toEqual({ drawer: false, overlay: true, mobile: false });
    expect(await at(767)).toEqual({ drawer: false, overlay: true, mobile: true });

    // Crossing the line while open: the sidebar pins itself, and steps back out of the way.
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    component.onWindowResize();
    expect(component.drawerVisible()).toBe(true);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });
    component.onWindowResize();
    expect(component.drawerVisible()).toBe(false);
  });
});
