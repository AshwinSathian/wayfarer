import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { AppComponent } from './app.component';
import { IdbService } from './data/idb.service';
import { PastRequest } from './models/history.models';
import { ConfirmationService } from 'primeng/api';

class IdbServiceMock {
  init = jasmine.createSpy('init').and.returnValue(Promise.resolve());
  getLatest = jasmine.createSpy('getLatest').and.returnValue(Promise.resolve([] as PastRequest[]));
  clear = jasmine.createSpy('clear').and.returnValue(Promise.resolve());
  delete = jasmine.createSpy('delete').and.returnValue(Promise.resolve());
  // AppShellComponent.ngOnInit() calls EnvironmentsService.ensureLoaded() and
  // SecretsService.hasAnySecrets(), both of which round-trip through IdbService.
  listEnvironments = jasmine.createSpy('listEnvironments').and.returnValue(Promise.resolve([]));
  getActiveEnvironmentId = jasmine.createSpy('getActiveEnvironmentId').and.returnValue(Promise.resolve(null));
  setActiveEnvironment = jasmine.createSpy('setActiveEnvironment').and.returnValue(Promise.resolve());
  peekSecretEnvelope = jasmine.createSpy('peekSecretEnvelope').and.returnValue(Promise.resolve(null));
  listCollections = jasmine.createSpy('listCollections').and.returnValue(Promise.resolve([]));
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

  it('loads history on init', fakeAsync(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    const history: PastRequest[] = [{
      id: 1,
      method: 'GET',
      url: 'https://example.com/api',
      headers: {},
      createdAt: 1
    }];
    idbService.getLatest.and.returnValue(Promise.resolve(history));

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    flushMicrotasks();

    expect(idbService.init).toHaveBeenCalled();
    expect(component.pastRequests).toEqual(history);
    expect(component.historyLoading).toBeFalse();
  }));

  it('clears history via the service', fakeAsync(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    const history: PastRequest[] = [{ id: 1, method: 'GET', url: 'https://example.com', headers: {}, createdAt: 1 }];
    idbService.getLatest.and.returnValue(Promise.resolve(history));

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    flushMicrotasks();

    idbService.getLatest.and.returnValue(Promise.resolve([]));

    component.clearPastRequests();
    flushMicrotasks();

    expect(idbService.clear).toHaveBeenCalled();
    expect(component.pastRequests).toEqual([]);
  }));

  it('deletes history entries', fakeAsync(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    const history: PastRequest[] = [{ id: 5, method: 'GET', url: 'https://delete.me', headers: {}, createdAt: 1 }];
    idbService.getLatest.and.returnValue(Promise.resolve(history));

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    flushMicrotasks();

    idbService.getLatest.and.returnValue(Promise.resolve([]));

    component.deletePastRequest(5);
    flushMicrotasks();

    expect(idbService.delete).toHaveBeenCalledWith(5);
    expect(component.pastRequests).toEqual([]);
  }));

  it('controls drawer visibility state', fakeAsync(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    idbService.getLatest.and.returnValue(Promise.resolve([]));

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    flushMicrotasks();

    expect(component.drawerVisible).toBeTrue();
    component.toggleHistoryDrawer();
    expect(component.drawerVisible).toBeFalse();
    component.openHistoryDrawer();
    expect(component.drawerVisible).toBeTrue();
    component.closeHistoryDrawer();
    expect(component.drawerVisible).toBeFalse();
  }));
});
