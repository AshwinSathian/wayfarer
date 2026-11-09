/**
 * The app did not start: a line and Reload in place of the splash (src/index.html), which would otherwise shimmer for
 * good. Plain DOM, since Angular is what failed; its look is splash.css and button.css.
 */
export function showBootFailure(root: Element, reload: () => void = () => location.reload()): void {
  const message = document.createElement("p");
  message.className = "type-body";
  message.textContent = "Wayfarer did not start. Reload the page to try again.";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ui-button ui-button-filled";
  button.textContent = "Reload";
  button.addEventListener("click", reload);
  const box = document.createElement("div");
  box.className = "splash-failed";
  box.setAttribute("role", "alert");
  box.append(message, button);
  const page = document.createElement("div");
  page.className = "splash";
  page.append(box);
  root.replaceChildren(page);
}
