import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ComposerHarness,
  JSON_HEADERS,
  jsonBytes,
  makeRequestDoc,
  meta,
  setupComposer,
} from "../../testing/composer-setup";
import { inCollection, inFolder, rowsOf } from "../../testing/request-fixtures";
import type { CollectionTree } from "./collections-store";
import { CollectionRunner } from "./collection-runner";
import { RunState } from "../state/run-state";
import { Tabs } from "../state/tabs";
import { Confirm } from "../ui/confirm";

// P5.2: a collection run in the app. The order is core's (`runRequests`, held to Newman there); this is what the app adds: the sender.
describe("CollectionRunner", () => {
  let httpMock: ComposerHarness["httpMock"];
  let collectionsService: ComposerHarness["collectionsService"];
  let idbService: ComposerHarness["idbService"];
  let vault: ComposerHarness["vault"];
  let runner: CollectionRunner;
  const confirm = { confirm: vi.fn() };

  const tree = (overrides: Partial<CollectionTree> = {}): CollectionTree => ({
    collection: {
      id: "c1",
      meta: meta("c1"),
      name: "Shop",
      order: 1,
      variables: rowsOf({ host: "https://api.test" }),
      ...inCollection,
      scriptTrust: { trusted: true, approved: [] },
    },
    folders: [{ id: "f1", meta: meta("f1"), collectionId: "c1", name: "Admin", order: 1, ...inFolder }],
    requests: [
      makeRequestDoc({ id: "list", name: "List", order: 1, url: "{{host}}/items", headers: [] }),
      makeRequestDoc({ id: "read", name: "Read", order: 2, url: "{{host}}/items/1", headers: [] }),
      makeRequestDoc({ id: "admin", name: "Stats", order: 1, folderId: "f1", url: "{{host}}/stats", headers: [] }),
    ],
    ...overrides,
  });
  const ok = (url: string, status = 200) =>
    vi.waitFor(() =>
      httpMock
        .expectOne(url)
        .flush(jsonBytes({}), { status, statusText: status === 200 ? "OK" : "No", headers: JSON_HEADERS }),
    );

  beforeEach(async () => {
    confirm.confirm.mockReset();
    ({ httpMock, collectionsService, idbService, vault } = await setupComposer([
      { provide: Confirm, useValue: confirm },
    ]));
    runner = TestBed.inject(CollectionRunner);
    collectionsService.setTree([tree()]);
  });
  afterEach(() => httpMock.verify());

  it("sends a collection's requests in the tree's order, a folder's first, and keeps each result as it arrives", async () => {
    const run = new RunState({ collectionId: "c1", name: "Shop" });
    const done = runner.start(run);
    expect(run.running()).toBe(true);

    await ok("https://api.test/stats");
    await vi.waitFor(() => expect(run.results().map((result) => result.name)).toEqual(["Stats"]));
    await ok("https://api.test/items", 404);
    await ok("https://api.test/items/1");
    await done;

    expect(run.running()).toBe(false);
    expect(run.report()?.ended).toBe("completed");
    expect(run.results().map((result) => [result.name, result.status])).toEqual([
      ["Stats", 200],
      ["List", 404],
      ["Read", 200],
    ]);
    // A run is not history, and it is in no tab of the strip.
    expect(idbService.add).not.toHaveBeenCalled();
    expect(TestBed.inject(Tabs).tabs()).toHaveLength(1);
    // What history would have kept of each exchange, for the run's HAR.
    expect(run.exchanges.map((entry) => entry.sent.url)).toEqual([
      "https://api.test/stats",
      "https://api.test/items",
      "https://api.test/items/1",
    ]);
  });

  it("a folder's run sends that folder's requests only", async () => {
    const run = new RunState({ collectionId: "c1", folderId: "f1", name: "Shop / Admin" });
    const done = runner.start(run);
    await ok("https://api.test/stats");
    await done;
    expect(run.results().map((result) => result.name)).toEqual(["Stats"]);
  });

  it("gives each iteration the row of the data file: in the address, and one iteration for each row", async () => {
    const run = new RunState({ collectionId: "c1", folderId: undefined, name: "Shop" });
    collectionsService.setTree([
      tree({
        folders: [],
        requests: [
          makeRequestDoc({ id: "list", name: "List", order: 1, url: "{{host}}/items?user={{user}}", headers: [] }),
        ],
      }),
    ]);
    run.dataFile.set({ name: "users.csv", rows: [rowsOf({ user: "ann" }), rowsOf({ user: "bob" })] });
    const done = runner.start(run);
    await ok("https://api.test/items?user=ann");
    await ok("https://api.test/items?user=bob");
    await done;
    expect(run.results().map((result) => result.iteration)).toEqual([0, 1]);
    expect(run.report()?.iterations).toBe(2);
  });

  it("a request that cannot be sent is a result with the reason, and the run goes on", async () => {
    collectionsService.setTree([
      tree({
        folders: [],
        requests: [
          makeRequestDoc({ id: "bad", name: "Bad", order: 1, url: "{{nowhere}}/x", headers: [] }),
          tree().requests[1],
        ],
      }),
    ]);
    const run = new RunState({ collectionId: "c1", name: "Shop" });
    const done = runner.start(run);
    await ok("https://api.test/items/1");
    await done;
    expect(run.results()[0]).toMatchObject({
      name: "Bad",
      error: "The address is not a URL a request can go to. Write it as https://host/path.",
      tests: [],
    });
    expect(run.results()[0].status).toBeUndefined();
    expect(run.results()[1].status).toBe(200);
  });

  it("Cancel ends the request on its way and sends no other", async () => {
    const run = new RunState({ collectionId: "c1", name: "Shop" });
    const done = runner.start(run);
    await vi.waitFor(() => httpMock.expectOne("https://api.test/stats"));
    runner.cancel(run);
    await done;
    expect(run.report()?.ended).toBe("cancelled");
    expect(run.results()).toHaveLength(1);
    expect(run.results()[0].error).toBe("The request was cancelled.");
    expect(run.running()).toBe(false);
  });

  it("@claim:C-053 asks before a vault secret goes to a host that a variable changed during the run moved the request to, once for that host, and a no ends the run", async () => {
    vault.secrets.set("s1", "plaintext-secret");
    const secret = { Authorization: "Bearer {{$secret.s1}}" };
    collectionsService.setTree([
      tree({
        folders: [],
        requests: [
          makeRequestDoc({ id: "a", name: "First", order: 1, url: "{{host}}/a", headers: rowsOf(secret) }),
          makeRequestDoc({ id: "b", name: "Second", order: 2, url: "{{host}}/b", headers: rowsOf(secret) }),
          makeRequestDoc({ id: "c", name: "Third", order: 3, url: "{{host}}/c", headers: rowsOf(secret) }),
        ],
      }),
    ]);
    const moveHost = () =>
      collectionsService.setTree([
        {
          ...collectionsService.tree()[0],
          collection: { ...collectionsService.tree()[0].collection, variables: rowsOf({ host: "https://evil.test" }) },
        },
      ]);

    // Yes: asked once, for the second request; the third goes to the same host without a question.
    confirm.confirm.mockResolvedValue(true);
    const yes = new RunState({ collectionId: "c1", name: "Shop" });
    const first = runner.start(yes);
    await vi.waitFor(() => httpMock.expectOne("https://api.test/a"));
    // What a script of the first request would do: the collection's variable now names another host.
    moveHost();
    httpMock
      .expectOne("https://api.test/a")
      .flush(jsonBytes({}), { status: 200, statusText: "OK", headers: JSON_HEADERS });
    await ok("https://evil.test/b");
    await ok("https://evil.test/c");
    await first;
    expect(confirm.confirm).toHaveBeenCalledTimes(1);
    expect(confirm.confirm.mock.calls[0][0].message).toContain('"Second" goes: from api.test to evil.test');

    // No: nothing goes to the other host, and the run ends there. The run starts from the variables as they are now, so the host is moved back first.
    collectionsService.setTree([
      {
        ...collectionsService.tree()[0],
        collection: { ...collectionsService.tree()[0].collection, variables: rowsOf({ host: "https://api.test" }) },
      },
    ]);
    confirm.confirm.mockReset().mockResolvedValue(false);
    const no = new RunState({ collectionId: "c1", name: "Shop" });
    const second = runner.start(no);
    await vi.waitFor(() => httpMock.expectOne("https://api.test/a"));
    moveHost();
    httpMock
      .expectOne("https://api.test/a")
      .flush(jsonBytes({}), { status: 200, statusText: "OK", headers: JSON_HEADERS });
    await second;
    expect(no.report()).toMatchObject({ ended: "ended", reason: expect.stringContaining("You chose not to send") });
    expect(no.results().map((result) => result.name)).toEqual(["First", "Second"]);
    expect(no.results()[1].error).toContain("was not sent");
  });

  it("a request without a vault secret is not asked about, whatever host it goes to", async () => {
    const run = new RunState({ collectionId: "c1", folderId: "f1", name: "Shop / Admin" });
    collectionsService.setTree([
      { ...tree(), collection: { ...tree().collection, variables: rowsOf({ host: "https://api.test" }) } },
    ]);
    const done = runner.start(run);
    await ok("https://api.test/stats");
    await done;
    expect(confirm.confirm).not.toHaveBeenCalled();
  });
});
