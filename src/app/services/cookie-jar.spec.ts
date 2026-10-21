import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { CookiesRepository } from "../data/cookies-repository";
import { IdbCore } from "../data/idb-core";
import type { StoredCookie } from "../data/idb-schema";
import { CookieJar } from "./cookie-jar";

/** The `cookies` store, in memory. */
class CookiesRepositoryFake {
  records = new Map<string, StoredCookie>();
  readAll = async (): Promise<StoredCookie[]> => [...this.records.values()].map((record) => ({ ...record }));
  write = async (put: StoredCookie[], remove: string[]): Promise<void> => {
    for (const record of put) this.records.set(record.key, { ...record });
    for (const key of remove) this.records.delete(key);
  };
  clear = async (): Promise<void> => this.records.clear();
}

class IdbFake {
  listener: ((stores: string[]) => void) | undefined;
  onChangeElsewhere(listener: (stores: string[]) => void): void {
    this.listener = listener;
  }
}

// P5.3: the app's cookie jar, for requests that leave through the Local Bridge.
describe("CookieJar", () => {
  let repository: CookiesRepositoryFake;
  let idb: IdbFake;
  let jar: CookieJar;
  const URL = "https://api.test/v1/login";
  const stored = () => [...repository.records.values()].map((record) => `${record.name}=${record.value}`).sort();
  const sent = (url: string) => jar.for(url).map((cookie) => `${cookie.name}=${cookie.value}`);

  beforeEach(async () => {
    repository = new CookiesRepositoryFake();
    idb = new IdbFake();
    TestBed.configureTestingModule({
      providers: [
        { provide: CookiesRepository, useValue: repository },
        { provide: IdbCore, useValue: idb },
      ],
    });
    jar = TestBed.inject(CookieJar);
    await jar.start();
  });

  it("keeps what a response set, gives it to a later request of that host and path, and stores it", async () => {
    await jar.store(URL, ["sid=abc; Path=/", "theme=dark; Path=/v1; Max-Age=3600"], []);
    expect(sent("https://api.test/v1/me")).toEqual(["theme=dark", "sid=abc"]);
    expect(sent("https://api.test/")).toEqual(["sid=abc"]);
    expect(sent("https://other.test/")).toEqual([]);
    expect(stored()).toEqual(["sid=abc", "theme=dark"]);
  });

  it("has every cookie of a response at once, before the store has any: the next hop of a redirect asks straight away", () => {
    void jar.store(URL, ["sid=abc; Path=/", "theme=dark; Path=/"], []);
    expect(sent("https://api.test/")).toEqual(["sid=abc", "theme=dark"]);
  });

  it("reads the stored cookies when the page starts", async () => {
    await jar.store(URL, ["sid=abc; Path=/"], []);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: CookiesRepository, useValue: repository },
        { provide: IdbCore, useValue: idb },
      ],
    });
    const again = TestBed.inject(CookieJar);
    expect(again.cookies()).toEqual([]);
    await again.start();
    expect(again.for("https://api.test/").map((cookie) => cookie.name)).toEqual(["sid"]);
  });

  it("a cookie the server ends is removed from the jar and from the store", async () => {
    await jar.store(URL, ["sid=abc; Path=/", "keep=1; Path=/"], []);
    await jar.store(URL, ["sid=; Path=/; Max-Age=0"], []);
    expect(sent("https://api.test/")).toEqual(["keep=1"]);
    expect(stored()).toEqual(["keep=1"]);
  });

  it("an edited value is what is sent and stored; a deleted cookie is in neither; Delete all empties both", async () => {
    await jar.store(URL, ["sid=abc; Path=/", "theme=dark; Path=/"], []);
    const [sid, theme] = jar.cookies();
    await jar.setValue(sid, "edited");
    expect(sent("https://api.test/")).toEqual(["sid=edited", "theme=dark"]);
    expect(stored()).toEqual(["sid=edited", "theme=dark"]);

    await jar.remove(theme);
    expect(sent("https://api.test/")).toEqual(["sid=edited"]);
    expect(stored()).toEqual(["sid=edited"]);

    await jar.clear();
    expect(jar.cookies()).toEqual([]);
    expect(stored()).toEqual([]);
  });

  it("a cookie whose value holds a vault secret of the request is kept in this tab's memory and is not stored", async () => {
    const SECRET = "vault-plaintext-91c3";
    await jar.store(URL, [`echo=${SECRET}; Path=/`, `b64=${btoa(SECRET)}; Path=/`, "plain=1; Path=/"], [SECRET]);
    expect(sent("https://api.test/")).toEqual([`echo=${SECRET}`, `b64=${btoa(SECRET)}`, "plain=1"]);
    expect(stored()).toEqual(["plain=1"]);
    expect(jar.inMemoryOnly(jar.cookies()[0])).toBe(true);
    expect(jar.inMemoryOnly(jar.cookies()[2])).toBe(false);

    // What another browser tab stored does not take it out of this one.
    idb.listener?.(["cookies"]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sent("https://api.test/").sort()).toEqual([`b64=${btoa(SECRET)}`, `echo=${SECRET}`, "plain=1"]);
  });

  it("reads again when another browser tab changed the store", async () => {
    repository.records.set("api.test|/|late", {
      key: "api.test|/|late",
      name: "late",
      value: "1",
      domain: "api.test",
      hostOnly: true,
      path: "/",
      secure: false,
      httpOnly: false,
      created: 1,
    });
    idb.listener?.(["history"]);
    await Promise.resolve();
    expect(jar.cookies()).toEqual([]);
    idb.listener?.(["cookies"]);
    await expect.poll(() => sent("https://api.test/")).toEqual(["late=1"]);
  });
});
