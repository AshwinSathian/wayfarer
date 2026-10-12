// Sets the theme before the page has a body, so it is never drawn in the other one first (F85). A file of
// its own because the Content-Security-Policy allows no inline script. The rule is `Theme`'s
// (src/app/services/theme.ts), which takes over when the app has started: a stored choice of light or dark,
// otherwise the system's.
(function () {
  var choice = null;
  try {
    choice = localStorage.getItem("wayfarer:theme") || localStorage.getItem("api-sandbox:theme");
  } catch (error) {
    // Storage is refused: the system's theme. `Theme` meets the same refusal and records it.
    choice = null;
  }
  var dark = choice === "dark" || (choice !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
})();
