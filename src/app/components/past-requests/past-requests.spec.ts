import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PastRequests, matches } from './past-requests';
import { PastRequest } from '../../models/history';
import { Confirm } from '../../ui/confirm';
import { describe, it, beforeEach, expect, vi } from "vitest";
import { historyEntry } from '../../../testing/request-fixtures';

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
    const request: PastRequest = { id: 1, ...historyEntry({ url: 'https://example.com', createdAt: 1 }) };
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

  it('filters by URL, method and status as typed in the search field, and says when nothing matches', async () => {
    const entries = [
      { id: 1, ...historyEntry({ method: 'GET', url: 'https://api.test/users', status: 200, createdAt: Date.now() }) },
      { id: 2, ...historyEntry({ method: 'POST', url: 'https://api.test/orders', status: 500, createdAt: Date.now() }) },
      { id: 3, ...historyEntry({ method: 'GET', url: 'https://other.test/users/500', createdAt: Date.now() }) },
    ];
    expect(entries.filter((entry) => matches(entry, 'USERS')).map((entry) => entry.id)).toEqual([1, 3]);
    expect(entries.filter((entry) => matches(entry, 'post')).map((entry) => entry.id)).toEqual([2]);
    // A status, or a part of the URL that reads the same.
    expect(entries.filter((entry) => matches(entry, '500')).map((entry) => entry.id)).toEqual([2, 3]);
    expect(entries.filter((entry) => matches(entry, 'get api.test  200')).map((entry) => entry.id)).toEqual([1]);
    expect(entries.filter((entry) => matches(entry, '  ')).map((entry) => entry.id)).toEqual([1, 2, 3]);

    fixture.componentRef.setInput('pastRequests', entries);
    await fixture.whenStable();
    const search = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type="search"]')!;
    const shown = () => component.groups().flatMap((group) => group.requests.map((request) => request.id));
    expect(shown()).toEqual([1, 2, 3]);

    search.value = 'orders';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(shown()).toEqual([2]);

    search.value = 'nothing-like-this';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(shown()).toEqual([]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No request in history matches.');
  });
});
