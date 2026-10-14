import { Injectable, inject, signal } from "@angular/core";
import { Redactor, cookiesFor, parseSetCookie, storeCookie, type Cookie } from "@wayfarer/core";
import { CookiesRepository } from "../data/cookies-repository";
import { IdbCore } from "../data/idb-core";
import { recordDiagnostic } from "./diagnostics";

const keyOf = (cookie: Cookie): string => `${cookie.domain}|${cookie.path}|${cookie.name}`;

/**
 * The app's cookie jar (P5.3), for requests that leave through the Local
 * Bridge: what a response set is kept, and sent with a later request to
 * the same domain and path (`packages/core/src/cookies/jar.ts` has the
 * rules). A direct request has the browser's jar, which a page cannot see.
 *
 * A cookie's value is kept as the server sent it, in the `cookies` store.
 * One whose value holds a vault secret of the request that got it is kept
 * in this tab's memory only: a secret's plaintext is stored nowhere but in
 * the vault. A cookie is never a template: `RequestExecutor` sends its
 * value as it is, and leaves out one that names a secret's reference (C-007).
 */
@Injectable({ providedIn: "root" })
export class CookieJar {
  private readonly repository = inject(CookiesRepository);
  private readonly idb = inject(IdbCore);

  private readonly held = signal<Cookie[]>([]);
  /** Every cookie of the jar, the stored ones and those of this tab's memory. */
  readonly cookies = this.held.asReadonly();
  /** The keys of the cookies that are not stored. */
  private readonly unstored = new Set<string>();

  /** Reads the stored cookies. Called once, when the page starts. */
  async start(): Promise<void> {
    await this.read();
    this.idb.onChangeElsewhere((stores) => {
      if (stores.includes("cookies")) void this.read();
    });
  }

  private async read(): Promise<void> {
    try {
      const stored = (await this.repository.readAll()).map(({ key: _key, ...cookie }) => cookie);
      this.held.update((held) => [...stored, ...held.filter((cookie) => this.unstored.has(keyOf(cookie)))]);
    } catch (error) {
      // Storage that cannot be read: the shell's banner says so. The jar lives in the page.
      recordDiagnostic(error, "cookies: could not read the stored cookies");
    }
  }

  /** The cookies a request to `url` carries, in the order they are sent. */
  for(url: string): Cookie[] {
    return cookiesFor(this.held(), url, Date.now());
  }

  /** Whether `cookie` is in this tab's memory only: its value holds a vault secret. */
  inMemoryOnly(cookie: Cookie): boolean {
    return this.unstored.has(keyOf(cookie));
  }

  /**
   * Keeps what the response of `url` set. `secrets` are the vault secrets that went into the request: a cookie that repeats one is not stored.
   * The jar in the page has them when this returns, before anything is written: the next hop of a redirect asks for them at once.
   */
  store(url: string, setCookies: string[], secrets: string[]): Promise<void> {
    const redactor = new Redactor(secrets);
    const writes = setCookies.map((header) => {
      const cookie = parseSetCookie(header, url, Date.now());
      return cookie ? this.put(cookie, redactor.text(cookie.value) !== cookie.value || redactor.text(cookie.name) !== cookie.name) : Promise.resolve();
    });
    return Promise.all(writes).then(() => undefined);
  }

  /** Changes the value of a cookie of the jar. */
  setValue(cookie: Cookie, value: string): Promise<void> {
    return this.put({ ...cookie, value: value.trim() }, this.inMemoryOnly(cookie));
  }

  remove(cookie: Cookie): Promise<void> {
    return this.put({ ...cookie, expires: 0 }, false);
  }

  async clear(): Promise<void> {
    this.unstored.clear();
    this.held.set([]);
    await this.write(() => this.repository.clear());
  }

  /** Puts `cookie` into the jar now, and resolves when the store has it too. */
  private put(cookie: Cookie, memoryOnly: boolean): Promise<void> {
    const before = this.held();
    const after = storeCookie(before, cookie, Date.now());
    this.held.set(after);
    const key = keyOf(cookie);
    const kept = after.find((held) => keyOf(held) === key);
    if (kept && memoryOnly) this.unstored.add(key);
    else this.unstored.delete(key);
    const gone = before.map(keyOf).filter((was) => !after.some((held) => keyOf(held) === was));
    // A cookie that is now memory-only may have been stored with another value before.
    return this.write(() => this.repository.write(kept && !memoryOnly ? [{ ...kept, key }] : [], kept && memoryOnly ? [...gone, key] : gone));
  }

  private async write(write: () => Promise<void>): Promise<void> {
    try {
      await write();
    } catch (error) {
      // The jar in the page is right; the shell's banner says when storage is not available.
      recordDiagnostic(error, "cookies: could not store the jar");
    }
  }
}
