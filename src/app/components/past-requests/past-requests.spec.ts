import { ComponentFixture, TestBed } from "@angular/core/testing";
import { PastRequests, matches } from "./past-requests";
import { PastRequest } from "@wayfarer/core";
import { Confirm } from "../../ui/confirm";
import { describe, it, beforeEach, expect, vi } from "vitest";
import { historyEntry } from "../../../testing/request-fixtures";

describe("PastRequests", () => {
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

  it("should create", () => {
    expect(component).toBeTruthy();
  });

  it("emits events when loading and deleting entries", async () => {
    const request: PastRequest = { id: 1, ...historyEntry({ url: "https://example.com", createdAt: 1 }) };
    fixture.componentRef.setInput("pastRequests", [request]);

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
    await component.confirmDelete(request, new Event("click"));
    expect(confirmService.confirm).toHaveBeenCalledOnce();
    expect(deleteSpy).not.toHaveBeenCalled();

    // The user accepts.
    confirmService.confirm.mockResolvedValueOnce(true);
    await component.confirmDelete(request, new Event("click"));
    expect(confirmService.confirm.mock.lastCall![0]).toMatchObject({
      message: "Remove this request from history?",
      acceptLabel: "Delete",
    });
    expect(deleteSpy).toHaveBeenCalledWith(1);
  });

  it("filters by URL, method and status as typed in the search field, and says when nothing matches", async () => {
    const entries = [
      { id: 1, ...historyEntry({ method: "GET", url: "https://api.test/users", status: 200, createdAt: Date.now() }) },
      {
        id: 2,
        ...historyEntry({ method: "POST", url: "https://api.test/orders", status: 500, createdAt: Date.now() }),
      },
      { id: 3, ...historyEntry({ method: "GET", url: "https://other.test/users/500", createdAt: Date.now() }) },
    ];
    expect(entries.filter((entry) => matches(entry, "USERS")).map((entry) => entry.id)).toEqual([1, 3]);
    expect(entries.filter((entry) => matches(entry, "post")).map((entry) => entry.id)).toEqual([2]);
    // A status, or a part of the URL that reads the same.
    expect(entries.filter((entry) => matches(entry, "500")).map((entry) => entry.id)).toEqual([2, 3]);
    expect(entries.filter((entry) => matches(entry, "get api.test  200")).map((entry) => entry.id)).toEqual([1]);
    expect(entries.filter((entry) => matches(entry, "  ")).map((entry) => entry.id)).toEqual([1, 2, 3]);

    fixture.componentRef.setInput("pastRequests", entries);
    await fixture.whenStable();
    const search = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type="search"]')!;
    const shown = () => component.groups().flatMap((group) => group.requests.map((request) => request.id));
    expect(shown()).toEqual([1, 2, 3]);

    search.value = "orders";
    search.dispatchEvent(new Event("input"));
    await fixture.whenStable();
    expect(shown()).toEqual([2]);

    search.value = "nothing-like-this";
    search.dispatchEvent(new Event("input"));
    await fixture.whenStable();
    expect(shown()).toEqual([]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain("No request in history matches.");
  });
  describe("choosing entries for a HAR (P4.6 c)", () => {
    const entries: PastRequest[] = [
      { id: 3, ...historyEntry({ url: "https://api.test/c", createdAt: 3000, status: 200 }) },
      { id: 2, ...historyEntry({ url: "https://api.test/b", createdAt: 2000, status: 500 }) },
      { id: 1, ...historyEntry({ url: "https://other.test/a", createdAt: 1000, status: 200 }) },
    ];
    const boxes = () => [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>('.md\\:flex input[type="checkbox"]'),
    ];
    const button = (text: RegExp) =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll("button")].find((candidate) =>
        text.test(candidate.textContent ?? ""),
      ) as HTMLButtonElement;
    const source = () =>
      (
        component as unknown as {
          harSource: () => {
            name: string;
            credentials: boolean;
            exchanges: (options: object) => { request: { url: string } }[];
          } | null;
        }
      ).harSource();

    beforeEach(() => {
      fixture.componentRef.setInput("pastRequests", entries);
      fixture.detectChanges();
    });

    it("nothing is chosen at first, and the export waits for a choice", () => {
      expect(boxes().map((box) => box.checked)).toEqual([false, false, false]);
      expect(button(/as HAR/).disabled).toBe(true);
    });

    it("ticked entries are exported oldest first, masked as history holds them, under a name of their own", () => {
      boxes()[0].click();
      boxes()[2].click();
      fixture.detectChanges();
      expect(button(/as HAR/).textContent).toContain("Export 2 as HAR…");
      button(/as HAR/).click();
      expect(source()?.name).toBe("wayfarer-history");
      expect(source()?.credentials).toBe(false);
      expect(
        source()
          ?.exchanges({})
          .map((exchange) => exchange.request.url),
      ).toEqual(["https://other.test/a", "https://api.test/c"]);
    });

    it('"Select all" takes what the search shows, and "Select none" lets go of the same', () => {
      component.query.set("api.test");
      fixture.detectChanges();
      button(/Select all/).click();
      fixture.detectChanges();
      expect(boxes().map((box) => box.checked)).toEqual([true, true]);
      expect(button(/as HAR/).textContent).toContain("Export 2 as HAR…");
      // The entry the search hid was not taken.
      component.query.set("");
      fixture.detectChanges();
      expect(boxes().map((box) => box.checked)).toEqual([true, true, false]);
      boxes()[2].click();
      fixture.detectChanges();
      button(/Select none/).click();
      fixture.detectChanges();
      expect(boxes().map((box) => box.checked)).toEqual([false, false, false]);
    });

    it("an entry deleted since it was ticked is not exported", () => {
      boxes()[0].click();
      boxes()[1].click();
      fixture.componentRef.setInput("pastRequests", entries.slice(1));
      fixture.detectChanges();
      expect(button(/as HAR/).textContent).toContain("Export 1 as HAR…");
    });
  });
});
