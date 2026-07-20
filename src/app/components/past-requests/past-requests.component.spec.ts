import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { PastRequestsComponent } from './past-requests.component';
import { PastRequest } from '../../models/history.models';
import { ConfirmationService } from 'primeng/api';
import { ConfirmPopupModule } from 'primeng/confirmpopup';

describe('PastRequestsComponent', () => {
  let component: PastRequestsComponent;
  let fixture: ComponentFixture<PastRequestsComponent>;

  beforeEach(async () => {
    const confirmationSpy = jasmine.createSpyObj<ConfirmationService>('ConfirmationService', ['confirm']);
    await TestBed.configureTestingModule({
      imports: [PastRequestsComponent, ConfirmPopupModule],
      providers: [provideNoopAnimations(), { provide: ConfirmationService, useValue: confirmationSpy }],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(PastRequestsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('emits events when loading and deleting entries', () => {
    const request: PastRequest = {
      id: 1,
      method: 'GET',
      url: 'https://example.com',
      headers: {},
      createdAt: 1
    };
    fixture.componentRef.setInput('pastRequests', [request]);

    const loadSpy = jasmine.createSpy('load');
    const deleteSpy = jasmine.createSpy('delete');
    component.loadRequest.subscribe(loadSpy);
    component.deleteRequest.subscribe(deleteSpy);

    component.load(request);
    expect(loadSpy).toHaveBeenCalledWith(request);

    const confirmationService = TestBed.inject(ConfirmationService) as jasmine.SpyObj<ConfirmationService>;
    component.confirmDelete(request, new Event('click'));
    expect(confirmationService.confirm).toHaveBeenCalled();
    const latestCall = confirmationService.confirm.calls.mostRecent().args[0];
    expect(latestCall.accept).toBeDefined();
    latestCall.accept!();
    expect(deleteSpy).toHaveBeenCalledWith(1);
  });
});
