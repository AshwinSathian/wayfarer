// What the site's pages do in the browser (PLAN-design 1.8): a file of the site's own, since its policy allows no
// inline script and the pages carry no React. The theme toggle, and the landing's demo.

// The theme: the app's stored choice (`wayfarer:theme`), which /app/theme.js applied before the page was drawn.
for (const button of document.querySelectorAll("[data-theme-toggle]")) {
  button.addEventListener("click", () => {
    const root = document.documentElement;
    const current = root.getAttribute("data-theme") ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem("wayfarer:theme", next);
    } catch {
      // Storage refused: the choice holds for this page only.
    }
  });
}

// The demo: the address typed, Send, and the answer, then the request's row of the trace marked as sent.
const demo = document.querySelector("[data-demo]");
if (demo) {
  const ADDRESS = "https://api.example.com/v1/users/42";
  const part = (name) => demo.querySelector(`[data-demo-${name}]`);
  const [address, caret, send, waiting, response, stop, replay] = ["address", "caret", "send", "waiting", "response", "stop", "replay"].map(part);
  let timers = [];

  const show = (typed, phase) => {
    address.textContent = ADDRESS.slice(0, typed);
    caret.hidden = phase !== "typing";
    send.textContent = phase === "sending" ? "Sending" : "Send";
    waiting.hidden = phase === "answered";
    waiting.textContent = phase === "sending" ? "Waiting for api.example.com…" : "No response yet.";
    response.hidden = phase !== "answered";
    stop.toggleAttribute("data-on", phase === "answered");
  };

  const play = () => {
    timers.forEach(clearTimeout);
    timers = [];
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return show(ADDRESS.length, "answered");
    show(0, "typing");
    const at = (ms, typed, phase) => timers.push(setTimeout(() => show(typed, phase), ms));
    for (let i = 1; i <= ADDRESS.length; i++) at(500 + i * 38, i, "typing");
    const typed = 500 + ADDRESS.length * 38;
    at(typed + 450, ADDRESS.length, "sending");
    at(typed + 1100, ADDRESS.length, "answered");
  };

  replay.hidden = false;
  replay.addEventListener("click", play);
  play();
}
