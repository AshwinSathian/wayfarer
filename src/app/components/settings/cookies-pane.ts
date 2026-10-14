import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { MatButton, MatIconButton } from "@angular/material/button";
import { MatFormField } from "@angular/material/form-field";
import { MatInput } from "@angular/material/input";
import type { Cookie } from "@wayfarer/core";
import { CookieJar } from "../../services/cookie-jar";
import { TransportRouter } from "../../services/transport-router";
import { Icon } from "../../shared/icon/icon";
import { Confirm } from "../../ui/confirm";

/**
 * The cookie jar, as a pane of Settings (P5.3): each cookie a response set
 * through the Local Bridge, with its value to change and a way to delete it.
 */
@Component({
  selector: "app-cookies-pane",
  imports: [Icon, MatButton, MatIconButton, MatFormField, MatInput],
  templateUrl: "./cookies-pane.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "block" },
})
export class CookiesPane {
  protected readonly jar = inject(CookieJar);
  private readonly confirm = inject(Confirm);
  private readonly transport = inject(TransportRouter);

  /** By domain, then path, then name: the order a person looks one up in. */
  protected readonly cookies = computed(() =>
    [...this.jar.cookies()].sort((a, b) => a.domain.localeCompare(b.domain) || a.path.localeCompare(b.path) || a.name.localeCompare(b.name))
  );
  /** The device's route (P6.4): what it says of the jar. */
  protected readonly route = computed(() => this.transport.route());

  /** What there is to say of a cookie besides its value, in the words of its attributes. */
  protected about(cookie: Cookie): string {
    return [cookie.hostOnly ? "this host only" : "and its subdomains", cookie.secure && "Secure", cookie.httpOnly && "HttpOnly", cookie.sameSite && `SameSite=${cookie.sameSite}`].filter(Boolean).join(" · ");
  }

  /** When a cookie ends, in the reader's own format. Not Angular's `DatePipe`: it brought 20 kB of date formatting into the first bundle. */
  protected until(expires: number): string {
    return new Date(expires).toLocaleString();
  }

  protected async clear(): Promise<void> {
    const count = this.cookies().length;
    if (await this.confirm.confirm({ title: "Delete all cookies?", message: `The jar holds ${count === 1 ? "1 cookie" : `${count} cookies`}. Requests sent after this carry none of them.`, acceptLabel: "Delete all", rejectLabel: "Cancel" })) {
      await this.jar.clear();
    }
  }
}
