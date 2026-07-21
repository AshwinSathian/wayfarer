import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { AppComponent } from './app.component';
import { IdbService } from './data/idb.service';
import { PastRequest } from './models/history.models';
import { ConfirmationService } from 'primeng/api';
import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";

class IdbServiceMock {
  init = vi.fn().mockReturnValue(Promise.resolve());
  getLatest = vi.fn().mockReturnValue(Promise.resolve([] as PastRequest[]));
  clear = vi.fn().mockReturnValue(Promise.resolve());
  delete = vi.fn().mockReturnValue(Promise.resolve());
  // AppShellComponent.ngOnInit() calls EnvironmentsService.ensureLoaded() and
  // SecretsService.hasAnySecrets(), both of which round-trip through IdbService.
  listEnvironments = vi.fn().mockReturnValue(Promise.resolve([]));
  getActiveEnvironmentId = vi.fn().mockReturnValue(Promise.resolve(null));
  setActiveEnvironment = vi.fn().mockReturnValue(Promise.resolve());
  peekSecretEnvelope = vi.fn().mockReturnValue(Promise.resolve(null));
  listCollections = vi.fn().mockReturnValue(Promise.resolve([]));
}

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let component: AppComponent;
  let idbService: IdbServiceMock;

  beforeEach(async () => {
    idbService = new IdbServiceMock();
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideNoopAnimations(),
        { provide: IdbService, useValue: idbService },
        ConfirmationService,
      ],
    }).compileComponents();
  });

  afterEach(() => {
    delete (window as any).innerWidth;
  });

  it('should create the app', () => {
    fixture = TestBed.createComponent(AppComponent);
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

    fixture = TestBed.createComponent(AppComponent);
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

    fixture = TestBed.createComponent(AppComponent);
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

    fixture = TestBed.createComponent(AppComponent);
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

    fixture = TestBed.createComponent(AppComponent);
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
});
