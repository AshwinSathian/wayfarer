import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PastRequests } from './past-requests';
import { PastRequest } from '../../models/history';
import { Confirm } from '../../ui/confirm';
import { describe, it, beforeEach, expect, vi } from "vitest";

describe('PastRequests', () => {
  let component: PastRequests;
  let fixture: ComponentFixture<PastRequests>;

  beforeEach(async () => {
    const confirmationSpy = { confirm: vi.fn() } as unknown as Confirm;
    await TestBed.configureTestingModule({
      imports: [PastRequests],
      providers: [{ provide: Confirm, useValue: confirmationSpy }],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(PastRequests);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('emits events when loading and deleting entries', async () => {
    const request: PastRequest = {
      id: 1,
      method: 'GET',
      url: 'https://example.com',
      headers: {},
      createdAt: 1
    };
    fixture.componentRef.setInput('pastRequests', [request]);

    const loadSpy = vi.fn();
    const deleteSpy = vi.fn();
    component.loadRequest.subscribe(loadSpy);
    component.deleteRequest.subscribe(deleteSpy);

    component.load(request);
    expect(loadSpy).toHaveBeenCalledWith(request);

    const confirmService = TestBed.inject(Confirm) as unknown as {
      confirm: ReturnType<typeof vi.fn>;
    };
    // The user backs out: nothing is deleted.
    confirmService.confirm.mockResolvedValueOnce(false);
    await component.confirmDelete(request, new Event('click'));
    expect(confirmService.confirm).toHaveBeenCalledOnce();
    expect(deleteSpy).not.toHaveBeenCalled();

    // The user accepts.
    confirmService.confirm.mockResolvedValueOnce(true);
    await component.confirmDelete(request, new Event('click'));
    expect(confirmService.confirm.mock.lastCall![0]).toMatchObject({ message: 'Remove this request from history?', acceptLabel: 'Delete' });
    expect(deleteSpy).toHaveBeenCalledWith(1);
  });
});
