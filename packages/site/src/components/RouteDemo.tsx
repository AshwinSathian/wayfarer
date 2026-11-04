import { Claims } from "./Claims";

const BODY: [string, string][] = [
  ["id", "42"],
  ["name", '"Ada Lovelace"'],
  ["email", '"ada@example.com"'],
  ["roles", '["admin", "editor"]'],
];

/**
 * The landing's demo (PLAN-design 1.8): a request typed and sent, and below it every request that left the tab,
 * which is the point. This is its first frame; public/site.js plays it when the page loads and again on Replay, and
 * with reduced motion shows the end. It sends nothing: the answer is written here.
 */
export function RouteDemo() {
  return (
    <figure className="relative" data-demo>
      <div
        aria-hidden="true"
        className="overflow-hidden rounded-lg border border-line-strong bg-paper-raised shadow-[var(--shadow-overlay)]"
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="rounded-sm bg-action-soft px-2 py-1 font-code type-site-caption font-bold text-action">
            GET
          </span>
          <span className="min-w-0 flex-1 truncate rounded-sm border border-line bg-paper px-3 py-1.5 font-code type-site-caption text-ink">
            <span data-demo-address />
            <span data-demo-caret className="caret ml-px inline-block h-[1em] w-px translate-y-[0.15em] bg-ink" />
          </span>
          <span data-demo-send className="rounded-sm bg-action px-3 py-1.5 type-site-small font-bold text-on-action">
            Send
          </span>
        </div>
        <div className="min-h-[11.5rem] bg-code-bg px-4 py-3 font-code type-site-caption text-code-ink">
          <div data-demo-waiting className="text-code-muted">
            No response yet.
          </div>
          <div data-demo-response hidden className="arrive">
            <div className="mb-2 flex flex-wrap gap-x-4 text-code-muted">
              <span className="font-bold text-code-string">200 OK</span>
              <span>application/json</span>
            </div>
            <div>{"{"}</div>
            {BODY.map(([key, value], i) => (
              <div key={key} className="pl-4">
                <span className="text-code-key">&quot;{key}&quot;</span>:{" "}
                <span className="text-code-string">{value}</span>
                {i < BODY.length - 1 ? "," : ""}
              </div>
            ))}
            <div>{"}"}</div>
          </div>
        </div>
      </div>

      <figcaption className="mt-6">
        <div className="flex items-baseline justify-between gap-4">
          <p className="type-site-body font-semibold text-ink">Everything that left the tab</p>
          <button
            type="button"
            data-demo-replay
            hidden
            className="type-site-small text-action underline underline-offset-4 hover:no-underline"
          >
            Replay
          </button>
        </div>
        <ol className="route-line mt-3 space-y-4">
          <li className="relative pl-9">
            <span
              aria-hidden="true"
              className="absolute left-[5px] top-1.5 size-3.5 rounded-full border-2 border-action bg-paper"
            />
            <code className="type-site-caption text-ink">GET /app/</code>
            <p className="type-site-small text-ink-muted">
              Wayfarer itself, from this site, once. After the first visit it loads from your browser, offline too.{" "}
              <Claims ids={["C-015"]} />
            </p>
          </li>
          <li className="relative pl-9">
            <span
              aria-hidden="true"
              data-demo-stop
              className="absolute left-[5px] top-1.5 size-3.5 rounded-full border-2 border-dashed border-action bg-paper"
            />
            <code className="type-site-caption text-ink">GET api.example.com/v1/users/42</code>
            <p className="type-site-small text-ink-muted">
              Your request, from this tab to the host you named. <Claims ids={["C-001"]} />
            </p>
          </li>
        </ol>
        <p className="mt-4 pl-9 type-site-small text-ink-muted">
          <strong className="text-ink">Nothing else.</strong> No account, no analytics, no server of Wayfarer&apos;s in
          between.
        </p>
      </figcaption>
    </figure>
  );
}
