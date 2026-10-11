// The OAuth 2.0 callback page (plan D20, P4.7). The identity provider sends
// the sign-in window here with `?code=…&state=…` or `?error=…`. This page
// hands that to the app over a BroadcastChannel and closes: under
// `Cross-Origin-Opener-Policy: same-origin` the window has no opener to
// post to. It loads nothing else, stores nothing, and the app takes the
// answer only when `state` is one it issued.
(() => {
  const query = new URLSearchParams(location.search);
  const state = query.get("state");
  const message = document.getElementById("message");
  // The code is not left in the address bar or in this window's history.
  history.replaceState(null, "", location.pathname);
  if (!state || (!query.get("code") && !query.get("error"))) {
    message.textContent = "This page finishes an OAuth 2.0 sign-in started in Wayfarer. There is none to finish here.";
    return;
  }
  const channel = new BroadcastChannel("wayfarer:oauth");
  channel.onmessage = (event) => {
    if (!event.data || event.data.state !== state || event.data.received !== true) return;
    channel.close();
    message.textContent = "Signed in. You can close this window.";
    window.close();
  };
  channel.postMessage({ state, code: query.get("code"), error: query.get("error"), description: query.get("error_description") });
  message.textContent = "Wayfarer has not answered. If its tab is closed, or the sign-in was cancelled there, close this window and start again.";
})();
