// "What changed in 3.0" (W5.5 of PLAN-design.md): the redesign, screen by screen, each change tied to its finding in
// docs/design/audit.md. The page (/what-changed-in-3-0/) and the post that shows two of its screens read this file.
// scripts/whats-new-images.mjs makes the pictures from docs/design/baseline/, and scripts/whats-new.test.mjs fails
// when a finding of severity 1 or 2 has no before and after here, or when the audit says it was accepted and this file
// gives no reason.

/** Where the pictures are taken from, and where they are served. */
export const BASELINE = "docs/design/baseline/";
export const PUBLIC_DIR = "/whats-new/";

/**
 * Each screen: the audit's picture of it before the redesign (2026-10-19 and 2026-10-22, the images at the top of
 * `BASELINE` and in `second-pass/`) and today's (`design-chromium/`, Chromium on Linux). `dark` only where a picture
 * of both exists in the dark theme. `cropBefore` keeps the top of a picture that is a whole page, in its pixels.
 */
export const SCREENS = [
  {
    id: "first-run",
    title: "The first screen",
    before: "1440-light-01b-first-run-full.png",
    after: "design-chromium/first-run-1440-light.png",
    beforeAlt:
      "Wayfarer 2 on a first visit: the sidebar casts a shadow, the toolbar is six icons, the route, two checkboxes and their sentences sit above the request's tabs, and the environments are two dashed boxes at the bottom of the page.",
    afterAlt:
      "Wayfarer 3 on a first visit: the address, then the request's tabs; the response pane offers Paste a cURL command; the toolbar names Environments, and a status bar at the foot says Route: direct and No vault.",
    findings: ["U-002", "U-023", "U-006", "U-022"],
  },
  {
    id: "response",
    title: "A response",
    before: "1440-light-03b-response-full.png",
    after: "design-chromium/response-json-1440-light.png",
    beforeAlt:
      "Wayfarer 2 after a send, 1,378 px tall: the JSON response starts 700 px down a narrow pane, and the environments are below it, past the end of the window.",
    afterAlt:
      "Wayfarer 3 after a send, in one 900 px window: the tree shows each request's method, and the response pane beside the request shows 200 OK, the time, the route and the JSON body.",
    dark: {
      before: "1440-dark-03-response.png",
      after: "design-chromium/response-json-1440-dark.png",
    },
    findings: ["U-001"],
  },
  {
    id: "response-820",
    title: "A response in a narrower window",
    before: "820-light-03-response.png",
    after: "design-chromium/response-json-820-light.png",
    beforeAlt:
      "Wayfarer 2 at 820 px: the response is a 290 px column beside the request, and its fourth tab is cut to Test.",
    afterAlt: "Wayfarer 3 at 820 px: the response sits under the request, as wide as the window, with all four tabs.",
    findings: ["U-003"],
  },
  {
    id: "phone",
    title: "A response on a phone",
    before: "390-light-03b-response-full.png",
    after: "design-chromium/response-json-390-light.png",
    beforeAlt:
      "Wayfarer 2 at 390 px: one column 2,220 px long, the response after every section of the request and the environments at the bottom.",
    afterAlt:
      "Wayfarer 3 at 390 px: Request and Response are two tabs under the address, and the response's status and body fill the screen.",
    findings: ["U-028"],
  },
  {
    id: "tree",
    title: "Opening a saved request",
    before: "1440-light-p-13-request-open.png",
    after: "design-chromium/tree-1440-light.png",
    beforeAlt:
      "Wayfarer 2: a request is selected in the tree, its rows show names only, and the composer still shows New request.",
    afterAlt:
      "Wayfarer 3: the tree shows GET, POST and DEL before each name, and the selected request, List pets, is open in the composer.",
    findings: ["U-008", "U-009"],
  },
  {
    id: "palette",
    title: "The command palette",
    before: "1440-light-p-22-palette.png",
    after: "design-chromium/palette-1440-light.png",
    beforeAlt:
      "Wayfarer 2's command palette: a dialog titled Command palette with a close button and a list of bordered buttons in Title Case.",
    afterAlt:
      "Wayfarer 3's command palette: a search field over a grouped list of commands, each shortcut drawn as a keycap at the right.",
    findings: ["U-011", "U-049", "U-156"],
  },
  {
    id: "import",
    title: "Importing a collection",
    before: "1440-light-p-10-import-review.png",
    after: "design-chromium/import-review-1440-light.png",
    beforeAlt:
      "Wayfarer 2's import review: each item is a tall card, the request Status and body is listed as Status And Body, and each says CREATE in green.",
    afterAlt:
      "Wayfarer 3's import review: a warning about a script, then one line per item with its kind, its name as it will be stored, and New.",
    findings: ["U-015", "U-133", "U-161"],
  },
  {
    id: "environments",
    title: "Environments and the vault",
    before: "1440-light-p-20-vault-create.png",
    after: "design-chromium/vault-create-1440-light.png",
    beforeAlt:
      "Wayfarer 2's Create vault passphrase dialog: two fields whose only names are their placeholders, and no word that a lost passphrase cannot be recovered.",
    afterAlt:
      "Wayfarer 3's Environments tab: the list of environments beside the editor, each variable with a box to switch it off, and under a variable being made secret the passphrase fields, labelled, with a sentence that a forgotten passphrase cannot be recovered.",
    findings: ["U-012", "U-041", "U-026", "U-135", "U-136", "U-060"],
  },
  {
    id: "collection-settings",
    title: "A collection's settings",
    before: "1440-light-p-16-collection-settings.png",
    after: "design-chromium/collection-settings-1440-light.png",
    beforeAlt: "Wayfarer 2: a collection's settings in a dialog over the page, with Cancel and Save settings.",
    afterAlt:
      "Wayfarer 3: a collection's settings in a tab of their own, with Variables, Auth, Scripts and Route, and the collection's variables in rows.",
    findings: ["U-169"],
  },
  {
    id: "run",
    title: "A collection run",
    before: "1440-light-p-17c-run-full.png",
    cropBefore: 1800,
    after: "design-chromium/run-1440-light.png",
    beforeAlt:
      "Wayfarer 2's run of 58 requests: row after row of the same red paragraph about a network error, with no count and no filter.",
    afterAlt:
      "Wayfarer 3's run: 3 passed, 1 failed and 4 of 5 tests, a Failed only box, one row per request with Show record and Open, and the report as JSON, JUnit XML or HAR.",
    findings: ["U-013", "U-014", "U-076", "U-039", "U-157"],
  },
  {
    id: "run-phone",
    title: "A run's fields in Firefox",
    before: "second-pass/firefox-run-390-light.png",
    after: "design-chromium/run-390-light.png",
    beforeAlt: "Wayfarer 2's run in Firefox at 390 px: Iterations and Delay with Firefox's own up and down arrows.",
    afterAlt: "Wayfarer 3's run at 390 px (Chromium's picture): the same fields as plain text boxes.",
    findings: ["U-057"],
  },
  {
    id: "failure",
    title: "A request that got no response",
    after: "design-chromium/response-error-1440-light.png",
    afterAlt:
      "Wayfarer 3 after a request to a closed port: No response, then where it was sent, what the browser reported (Failed to fetch), the command that starts the Local Bridge with Copy, and a field for its pairing code.",
    findings: ["U-051", "U-138", "U-159", "U-131"],
  },
];

/** What has no picture: the changes a screenshot does not show. */
export const GROUPS = [
  {
    id: "editing",
    title: "Tabs, saving and sending",
    findings: ["U-168", "U-066", "U-068", "U-067", "U-158", "U-134", "U-132", "U-130", "U-069", "U-139"],
  },
  { id: "storage", title: "Where your data is kept", findings: ["U-137", "U-165"] },
  {
    id: "screen-readers",
    title: "Screen readers and voice control",
    findings: ["U-061", "U-062", "U-075", "U-063", "U-071", "U-072"],
  },
  {
    id: "sizes",
    title: "Pointer, window size and text size",
    findings: ["U-064", "U-065", "U-070", "U-073", "U-153", "U-155"],
  },
  {
    id: "contrast",
    title: "Contrast and forced colours",
    findings: ["U-106", "U-107", "U-108", "U-074", "U-109", "U-113", "U-116", "U-117"],
  },
];

/**
 * Each finding: what it was in 2.x and what 3.0 does, or, for one the audit accepted, why. `claims` are the rows of
 * docs/claims.md behind what 3.0 does, where the ledger has one.
 */
export const FINDINGS = {
  "U-001": {
    was: "The app was a page that scrolled. At 1,440 by 900 the response's body started 700 px down, and the environments were below the composer.",
    now: "The app is fixed panes of the window's height: the sidebar, the request and the response each scroll inside themselves.",
  },
  "U-002": {
    was: "Every request showed the route, Follow redirects, the certificate check and a sentence for each above its own tabs: 250 px of options most requests never change.",
    now: "They are the request's Network tab, and the address is followed by the request's tabs.",
  },
  "U-003": {
    was: "The response got a third of the window: 425 px at 1,440, and at 820 px a 290 px column with its fourth tab cut.",
    now: "When the composer is narrow the response goes under the request, at the full width. Beside it, from 1,440 px, the response starts with 55% of the room. You can move the split, and it is remembered.",
    claims: ["C-031"],
  },
  "U-006": {
    was: "The toolbar was six icons (lock, key, router, moon, clock, gear) named only in tooltips.",
    now: "The vault, the secrets, the Local Bridge and the theme are in a status bar, each with its state in words; the toolbar names Environments beside its icon.",
  },
  "U-008": {
    was: "A click on a request in the tree selected it; opening it took a double click.",
    now: "One click opens it.",
    claims: ["C-024"],
  },
  "U-009": {
    was: "The tree showed names only.",
    now: "Each request's row starts with its method, in the method's colour.",
  },
  "U-011": {
    was: "The palette was a titled dialog of buttons that found commands only.",
    now: "The palette is a list under a search field that finds commands, requests by name, method or address, collections, environments and past requests, with each shortcut as a keycap.",
    claims: ["C-030"],
  },
  "U-012": {
    was: "Environments were picked in the toolbar and edited at the bottom of the page, below the composer.",
    now: "Environments are a tab of their own, opened from the toolbar, the palette or a variable's chip.",
    claims: ["C-025"],
  },
  "U-013": {
    was: "A run of 42 failed requests showed the same three lines 42 times, with no count, no progress and no way to see the failures alone.",
    now: "A run shows its counts, its progress while it runs and a Failed only filter, and a cause the requests share is said once.",
  },
  "U-014": {
    was: "When every request of a run failed for one reason, the report said it once per request and offered nothing.",
    now: "When the shared cause is that the page got no response, Set up the Local Bridge… is beside it and opens the bridge's settings.",
  },
  "U-015": {
    was: "The import review renamed what it listed (Status and body became Status And Body) and gave each item a 90 px card.",
    now: "Each item is one line: its kind, its name as it will be stored, and whether it is new.",
    claims: ["C-054"],
  },
  "U-022": {
    was: 'Empty places said "nothing here" and offered nothing: no collection button, no cURL paste, two dashed boxes for environments.',
    now: "An empty place says what goes there and offers the way in: Paste a cURL command, Import…, New collection, New environment.",
    claims: ["C-056"],
  },
  "U-023": {
    was: "Before anything was sent, the first screen explained the route and the Local Bridge in a sentence a newcomer could not use.",
    now: "That sentence is in the Network tab, where the route is chosen.",
  },
  "U-026": {
    was: "The vault's passphrase fields were named by placeholders that went away as you typed, and nothing said a forgotten passphrase is lost for good.",
    now: "The fields have labels, and creating a vault says that a forgotten passphrase, and the secrets it holds, cannot be recovered.",
    claims: ["C-027"],
  },
  "U-028": {
    was: "On a phone the app was one column 2,220 px long: a 150 px address field, the response after every section of the request, and the environments at the bottom.",
    now: "Below 768 px the request and the response are two tabs under the address, and a send opens the response.",
    claims: ["C-032"],
  },
  "U-039": {
    was: "A run of an imported collection sent its requests without their scripts and had no button for the review.",
    now: "The run's note has Review scripts…, and once they are reviewed the next run runs them.",
    claims: ["C-051"],
  },
  "U-041": {
    was: "A variable could not be switched off, only deleted, and the editor's columns had no headings.",
    now: "Each variable has a box that switches it off and keeps its value, under Name and Value headings.",
  },
  "U-049": {
    was: "Ctrl+K (⌘K) did nothing below 1,200 px, or while the focus was in a field.",
    now: "It opens the palette at every width, from anywhere.",
    claims: ["C-030"],
  },
  "U-051": {
    was: 'A host that did not exist and a server with no CORS header both read "0 Unknown Error".',
    now: "No response is said in plain words, with what the browser reported quoted as it reported it, and no invented status code.",
    claims: ["C-010"],
  },
  "U-057": {
    was: "In Firefox and WebKit the run's number fields showed the browser's own arrows.",
    now: "They are plain text boxes in every engine; the arrow keys still step them.",
  },
  "U-060": {
    was: "Closing the environments dialog, or choosing another environment, threw away unsaved edits without asking.",
    now: "The editor stores each field when you leave it, and what is left when you close it or choose another environment.",
  },
  "U-061": {
    was: "A send told a screen reader nothing: the result appeared in a new element no one announced.",
    now: "The response's status line is read out when it arrives.",
    claims: ["C-038"],
  },
  "U-062": {
    was: "An error that appeared after an action, such as the address's after Send, was not announced.",
    now: "It is announced as an alert.",
  },
  "U-063": {
    was: 'Two buttons had names that differed from their words ("Not now" was "Dismiss backup reminder"), so voice control could not reach them by what it saw.',
    now: "Every control's name contains its visible words, and a test holds every screen to it.",
  },
  "U-064": {
    was: "The split between the request and the response moved only by dragging or by the arrow keys.",
    now: "A click on either side of its line moves it a tenth, and a double click puts it back.",
    claims: ["C-031"],
  },
  "U-065": {
    was: "At 320 px wide, or 400% zoom, the page scrolled sideways.",
    now: "Every screen fits a 320 px window, in three browsers.",
  },
  "U-066": {
    was: "A save that failed said nothing; only the tab's unsaved dot stayed.",
    now: "A save that does not land says so beside Save.",
  },
  "U-067": {
    was: "Saving with ⌘S was reported to close the folder that held the request.",
    now: "After the save was rebuilt in this redesign it could not be made to happen in Chromium, Firefox or WebKit, and a test now holds the folder open.",
  },
  "U-068": {
    was: "Saving from the keyboard dropped the focus to the page, so the next key went nowhere.",
    now: "Save keeps the focus while it saves.",
    claims: ["C-067"],
  },
  "U-069": {
    was: 'In a run, "Send to a different host?" had a Send button that allowed every later request of the run, and said only that in small print.',
    now: 'The button says what one click allows: "Send to {host} for this run".',
    claims: ["C-053"],
  },
  "U-070": {
    was: "Below 1,200 px the tree was a closed drawer, so a saved request could not be seen beside the open one.",
    now: "From 1,024 px the sidebar can be kept beside the page, and the choice is remembered.",
  },
  "U-071": {
    was: 'Screen readers heard rows by number: "Send parameter 1", "Remove variable".',
    now: 'Each row is named by its content: for a parameter called page, "Send page" and "Remove page".',
  },
  "U-072": {
    was: "The status bar's words were beside small buttons with other names, and locking the vault was not announced.",
    now: "Each status bar item is one button named by its words, and a lock or unlock is read out.",
  },
  "U-073": {
    was: "At 200% text size the boxes grew and the text did not, so the response was squeezed to 220 px with its tabs cut.",
    now: "Text is sized in rem with everything else, and the response's tabs fit at 200%.",
  },
  "U-074": {
    was: "A focused field's edge was fainter than 3:1, and the address bar did not show which half had focus.",
    now: "A focused field has a 2 px edge in ink, above 10:1, on the half that has focus.",
  },
  "U-075": {
    was: "Fourteen messages (the update, the backup reminder, the storage warning and others) were made together with their live region, which screen readers often skip.",
    now: "Each region is there from the start and only its text changes, and a test refuses one made with its message.",
  },
  "U-076": {
    was: "A failed row of a run could not open its request or its response.",
    now: "Each row has Open, which opens the request in a tab of its own, and its record holds the response the run got.",
  },
  "U-106": {
    was: "An unchecked checkbox was a hairline at about 1.2:1.",
    now: "Its edge is 3:1 or more on every surface.",
  },
  "U-107": {
    was: "The option the keys were on in a select barely showed (1.08:1 in light).",
    now: "It is marked at 3:1 or more.",
  },
  "U-108": {
    was: "Grey text on the warning fill was under 4.5:1.",
    now: "Every label on a status fill is checked at 4.5:1 in both themes.",
  },
  "U-109": {
    was: "Controls were drawn as faintly as decoration: borders at 1.14 to 1.43:1.",
    now: "A control's edge is 3:1 on every surface, and darker on hover.",
  },
  "U-113": {
    was: "A disabled field looked enabled.",
    now: "A disabled field has a quiet fill and grey text; a read-only one has a dashed edge.",
  },
  "U-116": {
    was: "In forced colours (Windows' contrast themes) five marks disappeared, among them the unsaved dot and the timing bars.",
    now: "Each of the five has a forced-colours rule, and a test checks each.",
  },
  "U-117": {
    was: "The selected row was a fill of about 1.2:1, and hovering it took the fill away.",
    now: "The selected row has a 3 px ink mark at its start that stays on hover.",
  },
  "U-130": {
    was: "The Auth tab named where the auth was set, not where its value came from, so it could name the wrong source for the token that was sent.",
    now: "The Auth tab names where a token's value comes from, and the auth's variables have chips.",
  },
  "U-131": {
    was: '"Route: Auto" in the status bar described a setting, not what would happen, on a device with no bridge paired.',
    now: 'The status bar says what the app will do ("Route: direct"), and a failed send says "Direct to {host}, no bridge paired".',
    claims: ["C-064"],
  },
  "U-132": {
    was: 'A variable\'s chip did nothing for a missing, collection, secret or dynamic variable; the red "Missing" chip was dead.',
    now: "Each chip opens where its value is set, and a missing one offers to add it to an environment or the collection.",
    claims: ["C-025"],
  },
  "U-133": {
    was: "An import did not say that every request used a variable nothing in the file defined, so the first send failed.",
    now: "The review names the variables no file gives a value, and how many requests use them.",
    claims: ["C-054"],
  },
  "U-134": {
    was: "With {{base}} unset, Send said the address was not a URL, and three messages stacked for one cause.",
    now: "A send held back by a variable with no value names that variable, once.",
    claims: ["C-045"],
  },
  "U-135": {
    was: "With no vault, marking a variable secret opened Create vault and then dropped the mark, so the token was stored as plain text.",
    now: "The row asks for the passphrase in place, and once the vault is made the variable is stored as a reference to its secret.",
    claims: ["C-003"],
  },
  "U-136": {
    was: '"Secret stored" appeared before the environment was saved, and closing it left a secret no variable named.',
    now: "The variable's reference is written the moment its secret is, and a write that fails says so.",
  },
  "U-137": {
    was: 'The status bar said "Saved in this browser" while the browser had not promised to keep anything, and the backup reminder waited 14 days.',
    now: "The status bar says what the browser answered, and while it has promised nothing the reminder comes at the first save and every 5 days.",
  },
  "U-138": {
    was: "A failure the Local Bridge would fix ended with a sentence about the bridge and no way to start it.",
    now: "The failure opens its record with npx wayfarer-bridge, Copy, the pairing code and Send again once paired.",
    claims: ["C-064"],
  },
  "U-139": {
    was: "Switched-off query parameters of a Postman file were lost on save, and the import note said the composer had no switch for them.",
    now: "Switched-off parameters stay where they were, and the note is gone.",
    claims: ["C-058"],
  },
  "U-153": {
    was: "With a larger default text size in the browser, the wide layout stayed and cut the address and the fields.",
    now: "Every breakpoint is in em, so a larger text size gets the layout of a narrower window.",
  },
  "U-155": {
    was: "Params was laid out by the window's width and could leave a name and a value 47 px each.",
    now: "Params is the same rows editor as Headers and wraps by the room it has.",
  },
  "U-156": {
    was: "A collection run was reached only from the tree's right-click menu.",
    now: 'The palette offers "Run {collection}…" for every collection and the selected folder.',
  },
  "U-157": {
    was: "Before the first run of an imported collection, the run view promised its scripts would run; they were held.",
    now: "Before the run, the view says the scripts wait for a review, with Review scripts….",
    claims: ["C-051"],
  },
  "U-158": {
    was: "A send whose scripts were held said so only in the response's Tests tab.",
    now: "The note is under the status line, whichever response tab is open.",
    claims: ["C-051"],
  },
  "U-159": {
    was: "The bridge's set-up did not say it runs in a terminal and needs Node.js, or what Chrome, Edge and Safari ask of it.",
    now: "It says to start it in a terminal with Node.js 22.21 or later, that Chrome and Edge may ask about the local network, and that Safari needs HTTPS.",
  },
  "U-161": {
    was: "Importing a changed copy of a collection listed every item as Replaces, and could not be undone.",
    now: "Each item says New, Same or Changes, and Undo puts back what the import replaced for 10 seconds.",
    claims: ["C-054"],
  },
  "U-165": {
    was: "That Safari deletes a site's data after seven days without a visit was said only in Settings.",
    now: 'In Safari the status bar says "Kept by Safari for 7 days without a visit", and the backup reminder says how to keep it.',
  },
  "U-168": {
    was: "New request emptied the open tab, unsaved edits and all, without a word.",
    now: "New request opens a tab of its own, and the open tab keeps what was typed.",
  },
  "U-169": {
    was: "A collection's or a folder's settings closed on Escape or × and dropped every edit.",
    now: "Closing with changes asks first, with Keep editing as the button that has focus.",
  },
};

/** A picture's file under `PUBLIC_DIR`: its name in the baseline, as a JPEG. */
export const imageName = (from) =>
  `${from
    .split("/")
    .pop()
    .replace(/\.png$/, "")}.jpg`;

/** Every picture the page shows, with the height of its source it keeps (`undefined`: all of it). */
export function pictures() {
  return SCREENS.flatMap((s) => [
    ...(s.before ? [{ from: s.before, crop: s.cropBefore }] : []),
    { from: s.after },
    ...(s.dark ? [{ from: s.dark.before }, { from: s.dark.after }] : []),
  ]);
}

const escape = (text) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * A screen's before and after as HTML, for the page and the post alike. `sizes` is whats-new-images.mjs. With a dark
 * pair, both are drawn and the site's stylesheet shows the page's theme (`shot-light`, `shot-dark`).
 */
export function screenHtml(screen, sizes, { lazy = true } = {}) {
  const img = (from, alt, label) => {
    const name = imageName(from);
    const size = sizes[name];
    if (!size) throw new Error(`whats-new: no picture ${name}; run node scripts/whats-new-images.mjs`);
    return (
      `<figure class="m-0 min-w-0"><figcaption class="type-site-small font-semibold text-ink-muted">${label}</figcaption>` +
      `<img class="mt-2 h-auto w-full rounded-sm border border-line-strong" src="${PUBLIC_DIR}${name}" width="${size.width}" height="${size.height}"${lazy ? ' loading="lazy"' : ""} decoding="async" alt="${escape(alt)}"></figure>`
    );
  };
  const pair = (before, after, dark) => {
    const suffix = dark ? " (dark theme)" : "";
    const parts = [
      before ? img(before, screen.beforeAlt + suffix, "Before, 2.x") : "",
      img(after, screen.afterAlt + suffix, "Now, 3.0"),
    ];
    const theme = screen.dark ? ` shot-${dark ? "dark" : "light"}` : "";
    return `<div class="grid grid-cols-1 items-start gap-6 md:grid-cols-2${theme}">${parts.join("")}</div>`;
  };
  return (
    pair(screen.before, screen.after, false) + (screen.dark ? pair(screen.dark.before, screen.dark.after, true) : "")
  );
}
