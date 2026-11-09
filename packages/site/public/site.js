// What the site's pages do in the browser: a file of the site's own, since its policy allows no inline script. The theme
// toggle, the header's menu, the landing's record of what the page fetched, the recordings' Play buttons, and each section's entrance.

// The theme: the app's stored choice (`wayfarer:theme`), which /app/theme.js applied before the page was drawn.
for (const button of document.querySelectorAll("[data-theme-toggle]")) {
  button.addEventListener("click", () => {
    const root = document.documentElement;
    const current =
      root.getAttribute("data-theme") ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    showPosters();
    try {
      localStorage.setItem("wayfarer:theme", next);
    } catch {
      // Storage refused: the choice holds for this page only.
    }
  });
}

// The menu below 1024 px, a <details> over the page, closes as the app's popups do: on Escape (focus back on Menu), on
// a press outside it, and when focus leaves it. The browser's <details> does none of these.
const menu = document.querySelector("details.menu");
if (menu) {
  const summary = menu.querySelector("summary");
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !menu.open) return;
    menu.open = false;
    summary.focus();
  });
  document.addEventListener("click", (event) => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
  menu.addEventListener("focusout", (event) => {
    if (event.relatedTarget && !menu.contains(event.relatedTarget)) menu.open = false;
  });
}

// The page's own record: every file the browser fetched for it, from the browser's Resource Timing, as it arrives,
// counted by kind, with every file by name below. Text only (textContent): a file's name is the browser's, not ours.
const record = document.querySelector("[data-record]");
if (record && "PerformanceObserver" in window) {
  const kinds = record.querySelector("[data-record-kinds]");
  const files = record.querySelector("[data-record-rows]");
  const summary = record.querySelector("[data-record-summary]");
  record.querySelector("[data-record-files]").hidden = false;
  const KINDS = [
    ["This page", /^$/],
    ["Stylesheet", /\.css$/],
    ["Scripts", /\.m?js$/],
    ["Fonts", /\.woff2?$/],
    ["Pictures", /\.(avif|webp|jpe?g|png|svg|ico)$/],
    ["Recordings", /\.(webm|mp4)$/],
  ];
  const kindOf = (path, isPage) =>
    isPage ? "This page" : (KINDS.find(([, test], i) => i > 0 && test.test(path))?.[0] ?? "Other");
  const seen = new Set();
  const tally = new Map();
  const hosts = new Set();
  let bytes = 0;
  const kB = (n) => `${(n / 1024).toLocaleString("en-GB", { maximumFractionDigits: n < 10240 ? 1 : 0 })} kB`;
  const cell = (row, text, className) => {
    const td = document.createElement("td");
    td.textContent = text;
    if (className) td.className = className;
    row.append(td);
  };
  const draw = () => {
    kinds.replaceChildren(
      ...[...KINDS.map(([name]) => name), "Other"]
        .filter((name) => tally.has(name))
        .map((name) => {
          const { count, size, from } = tally.get(name);
          const row = document.createElement("tr");
          cell(row, name);
          cell(row, String(count), "num");
          cell(row, [...from].join(", "), "from");
          cell(row, kB(size), "num");
          return row;
        }),
    );
    const n = seen.size === 1 ? "1 file" : `${seen.size} files`;
    const from = hosts.size === 1 ? "1 host" : `${hosts.size} hosts`;
    const cookies = document.cookie === "" ? "no cookies" : "cookies set";
    summary.textContent = `${n} from ${from}, ${kB(bytes)} in all, ${cookies}.`;
  };
  const add = (url, size, isPage = false) => {
    if (seen.has(url)) return;
    seen.add(url);
    const at = new URL(url, location.href);
    let path = at.pathname;
    try {
      path = decodeURIComponent(path);
    } catch {
      // A name the browser recorded with a stray %: shown as it was recorded.
    }
    const kind = kindOf(path, isPage);
    const entry = tally.get(kind) ?? { count: 0, size: 0, from: new Set() };
    entry.count += 1;
    entry.size += size;
    entry.from.add(at.host);
    tally.set(kind, entry);
    hosts.add(at.host);
    bytes += size;
    const item = document.createElement("li");
    item.className = "arrive file";
    item.textContent = `${at.host}${path} (${size ? kB(size) : "from the cache"})`;
    files.append(item);
  };
  const take = (entries) => {
    entries.forEach((entry) => add(entry.name, entry.transferSize ?? 0));
    draw();
  };
  const [navigation] = performance.getEntriesByType("navigation");
  add(location.href.split("#")[0], navigation?.transferSize ?? 0, true);
  take(performance.getEntriesByType("resource"));
  new PerformanceObserver((list) => take(list.getEntries())).observe({ type: "resource" });
}

// A recording shows its poster and the site's Play, not the browser's controls, until it is asked for: the browser's
// own drew their bar and a loading arc over the app's picture. Once asked for, it plays with the browser's controls.
// The poster of each recording of the shown theme (global.css's rule: dark unless the page is light): the other
// theme's is fetched only once it is shown. Chosen by the theme, not by layout: WebKit ran this before the stylesheet
// hid the other theme's, and gave them posters too.
function showPosters() {
  const theme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  for (const video of document.querySelectorAll(`.shot-${theme} video[data-poster]`))
    if (!video.poster) video.poster = video.dataset.poster;
}
showPosters();
for (const button of document.querySelectorAll("[data-play]")) {
  const video = button.parentElement.querySelector("video");
  video.controls = false;
  button.hidden = false;
  button.addEventListener("click", () => {
    button.hidden = true;
    video.controls = true;
    void video.play();
    video.focus();
  });
}

// Each part of a section rises into place as the section comes into view, once. The page is marked only when there is
// something below the first screen to show, so without script, or with reduced motion, everything is simply there.
if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const all = [...document.querySelectorAll(".rise")];
  const below = all.filter((el) => el.getBoundingClientRect().top > innerHeight);
  if (below.length) {
    for (const el of all) if (!below.includes(el)) el.classList.add("in");
    document.documentElement.setAttribute("data-enter", "");
    const watch = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            watch.unobserve(entry.target);
          }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    below.forEach((el) => watch.observe(el));
  }
}
