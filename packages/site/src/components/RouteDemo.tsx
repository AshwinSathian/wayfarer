"use client";

import { useEffect, useState } from "react";
import { Claims } from "./Claims";

const ADDRESS = "https://api.example.com/v1/users/42";
const BODY: [string, string][] = [
  ["id", "42"],
  ["name", '"Ada Lovelace"'],
  ["email", '"ada@example.com"'],
  ["roles", '["admin", "editor"]'],
];

/** Where the demo is: how much of the address is typed, then sending, then answered. */
interface Step { typed: number; phase: "typing" | "sending" | "answered" }
const START: Step = { typed: 0, phase: "typing" };
const END: Step = { typed: ADDRESS.length, phase: "answered" };

/**
 * The landing's demo (PLAN-design 1.8): a request typed and sent, and below it every request that left the tab,
 * which is the point. It plays once when the page loads, and again on Replay; with reduced motion it shows the end.
 * It sends nothing: the answer is written here.
 */
export function RouteDemo() {
  const [step, setStep] = useState<Step>(START);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(END);
      return;
    }
    setStep(START);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= ADDRESS.length; i++) timers.push(setTimeout(() => setStep({ typed: i, phase: "typing" }), 500 + i * 38));
    const typed = 500 + ADDRESS.length * 38;
    timers.push(setTimeout(() => setStep({ typed: ADDRESS.length, phase: "sending" }), typed + 450));
    timers.push(setTimeout(() => setStep(END), typed + 1100));
    return () => timers.forEach(clearTimeout);
  }, [run]);

  const answered = step.phase === "answered";
  return (
    <figure className="relative">
      <div aria-hidden="true" className="overflow-hidden rounded-2xl border border-line-strong bg-paper-raised shadow-[0_24px_60px_-30px_rgb(18_22_32/0.45)]">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="rounded-md bg-route-soft px-2 py-1 font-mono text-xs font-bold text-route">GET</span>
          <span className="min-w-0 flex-1 truncate rounded-md border border-line bg-paper px-3 py-1.5 font-mono text-[0.8rem] text-ink">
            {ADDRESS.slice(0, step.typed)}
            {step.phase === "typing" && <span className="caret ml-px inline-block h-[1em] w-px translate-y-[0.15em] bg-ink" />}
          </span>
          <span
            className="rounded-md bg-route px-3 py-1.5 text-sm font-bold text-route-ink"
          >
            {step.phase === "sending" ? "Sending" : "Send"}
          </span>
        </div>
        <div className="min-h-[11.5rem] bg-code-bg px-4 py-3 font-mono text-[0.8rem] leading-6 text-code-ink">
          {answered ? (
            <div className="arrive">
              <div className="mb-2 flex flex-wrap gap-x-4 text-code-muted">
                <span className="font-bold text-code-string">200 OK</span>
                <span>application/json</span>
              </div>
              <div>{"{"}</div>
              {BODY.map(([key, value], i) => (
                <div key={key} className="pl-4">
                  <span className="text-code-key">&quot;{key}&quot;</span>: <span className="text-code-string">{value}</span>
                  {i < BODY.length - 1 ? "," : ""}
                </div>
              ))}
              <div>{"}"}</div>
            </div>
          ) : (
            <div className="text-code-muted">{step.phase === "sending" ? "Waiting for api.example.com…" : "No response yet."}</div>
          )}
        </div>
      </div>

      <figcaption className="mt-6">
        <div className="flex items-baseline justify-between gap-4">
          <p className="font-display text-base font-semibold text-ink">Everything that left the tab</p>
          <button type="button" onClick={() => setRun((n) => n + 1)} className="text-sm text-route underline underline-offset-4 hover:no-underline">
            Replay
          </button>
        </div>
        <ol className="route-line mt-3 space-y-4">
          <li className="relative pl-9">
            <span aria-hidden="true" className="absolute left-[5px] top-1.5 size-3.5 rounded-full border-2 border-route bg-paper" />
            <code className="text-[0.8rem] text-ink">GET /app/</code>
            <p className="text-sm text-ink-muted">
              Wayfarer itself, from this site, once. After the first visit it loads from your browser, offline too. <Claims ids={["C-015"]} />
            </p>
          </li>
          <li className={`relative pl-9 ${answered ? "arrive" : ""}`}>
            <span aria-hidden="true" className={`absolute left-[5px] top-1.5 size-3.5 rounded-full border-2 border-route ${answered ? "bg-route" : "border-dashed bg-paper"}`} />
            <code className="text-[0.8rem] text-ink">GET api.example.com/v1/users/42</code>
            <p className="text-sm text-ink-muted">
              Your request, from this tab to the host you named. <Claims ids={["C-001"]} />
            </p>
          </li>
        </ol>
        <p className="mt-4 pl-9 text-sm text-ink-muted">
          <strong className="text-ink">Nothing else.</strong> No account, no analytics, no server of Wayfarer&apos;s in between.
        </p>
      </figcaption>
    </figure>
  );
}
