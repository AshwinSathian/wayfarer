import { TestBed, type ComponentFixture } from "@angular/core/testing";
import { emptyRequest, openShareLink, parseShareFragment } from "@wayfarer/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { repositories, type Repositories } from "../../../testing/repositories";
import { CollectionsStore } from "../../services/collections-store";
import { ShareDialog } from "./share-dialog";

// Share… (T1.2) over the real stores: what goes, and where, is said before anything can leave.
describe("ShareDialog", () => {
  let collections: CollectionsStore;
  let idb: Repositories;
  let fixture: ComponentFixture<ShareDialog>;

  beforeEach(async () => {
    TestBed.configureTestingModule({});
    collections = TestBed.inject(CollectionsStore);
    idb = repositories();
    await collections.ensureLoaded();
  });

  afterEach(async () => {
    fixture?.destroy();
    vi.restoreAllMocks();
    await idb.resetDatabase();
  });

  async function shop(body = ""): Promise<{ id: string; name: string }> {
    const { meta } = await collections.createCollection({ name: "Shop API" });
    await collections.createRequest({
      ...emptyRequest(),
      collectionId: meta.id,
      name: "Orders",
      url: "https://api.shop.example.com/orders",
      auth: { type: "bearer", token: "typed-token-1234" },
      scripts: { pre: "pm.variables.set('a', 1)", post: "" },
      body: { mode: "raw", raw: { language: "text", text: body } },
    });
    return { id: meta.id, name: "Shop API" };
  }

  async function open(collection: { id: string; name: string }): Promise<HTMLElement> {
    fixture = TestBed.createComponent(ShareDialog);
    fixture.componentRef.setInput("collection", collection);
    fixture.detectChanges();
    await settle();
    return fixture.nativeElement as HTMLElement;
  }

  async function settle(): Promise<void> {
    for (let i = 0; i < 5; i += 1) {
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve, 10));
      fixture.detectChanges();
    }
  }

  const text = (root: HTMLElement) => (root.closest("body") ?? root).textContent?.replace(/\s+/g, " ") ?? "";
  const button = (root: HTMLElement, name: string) =>
    [...(root.closest("body") ?? root).querySelectorAll("button")].find((b) => b.textContent?.trim().endsWith(name));
  const radio = (root: HTMLElement, name: string) =>
    [...(root.closest("body") ?? root).querySelectorAll<HTMLInputElement>("input[type=radio]")].find(
      (input) => input.closest("label")?.textContent?.trim() === name || input.getAttribute("aria-label") === name,
    );

  async function chooseLink(root: HTMLElement): Promise<void> {
    const link = radio(root, "Link");
    expect(link).toBeTruthy();
    link!.click();
    fixture.detectChanges();
  }

  it("says what goes: the counts, the masked credential and the scripts that will not run unread", async () => {
    const root = await open(await shop());
    const said = text(root);
    expect(said).toContain("What goes 1 request and 1 script.");
    expect(said).toContain("1 credential typed into auth is written as *** unless this is ticked.");
    expect(said).toContain("1 script goes with it. They will not run for the receiver until they read them");
  });

  it("names the file before Save file, and saves the masked collection under that name", async () => {
    const root = await open(await shop());
    expect(text(root)).toContain("Saves shop-api.wayfarer.json to your downloads.");
    const save = button(root, "Save file")!;
    expect(save.disabled).toBe(false);
    const created = vi.spyOn(URL, "createObjectURL");
    save.click();
    const blob = created.mock.calls[0][0] as Blob;
    const saved = await blob.text();
    expect(saved).toContain("***");
    expect(saved).not.toContain("typed-token-1234");
  });

  it("gives the link's length before Make link is enabled, and the link opens with its code", async () => {
    // The link is sealed while Make link waits, disabled, and nothing about its length is said yet.
    const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    vi.spyOn(crypto.subtle, "encrypt").mockImplementation(async (...args) => {
      await held;
      return encrypt(...args);
    });
    const root = await open(await shop());
    await chooseLink(root);
    expect(text(root)).toContain("Making the link…");
    expect(text(root)).not.toContain("kB");
    expect(button(root, "Make link")!.disabled).toBe(true);
    release();
    await settle();
    expect(text(root)).toMatch(/The link is \d+ kB\./);
    const make = button(root, "Make link")!;
    expect(make.disabled).toBe(false);
    make.click();
    await settle();
    const body = root.closest("body") ?? root;
    const address = body.querySelector<HTMLInputElement>("#share-link")!.value;
    const code = body.querySelector<HTMLInputElement>("#share-code")!.value;
    const url = new URL(address);
    expect(url.hash.startsWith("#share=")).toBe(true);
    expect(url.hash).not.toContain("&key=");
    const opened = await openShareLink(parseShareFragment(url.hash), code);
    expect(opened).toContain("***");
    expect(opened).not.toContain("typed-token-1234");
  });

  it("offers a file instead of a link longer than the limit", async () => {
    // Text that does not compress: hex of random bytes.
    const noise = Array.from(crypto.getRandomValues(new Uint8Array(12_000)), (b) => b.toString(16).padStart(2, "0"));
    const root = await open(await shop(noise.join("")));
    await chooseLink(root);
    await settle();
    expect(text(root)).toMatch(/This collection makes a link of \d+ kB\. A link can be 12 kB at most/);
    expect(button(root, "Make link")).toBeUndefined();
    expect(button(root, "Save file")!.disabled).toBe(false);
  });
});
