// The words the app says, in one place (overhaul S1a). `scripts/glossary.test.mjs` holds them, and every page,
// to the glossary (the banned words are in that test). Plain words, no internal IDs. Why it is in core: the headline of a send is core's
// (`recordHeadline`), and the CLI says the same things. No DOM here.
//
// A function takes what the app fills in. A slice that needs another wording changes it here, in its own PR.
// Types are erasable only (no enum): Node reads this file directly in the glossary test.

export const ROUTE_NAMES = { auto: "Auto", page: "From this page", bridge: "Local Bridge" } as const;

/** The route setting's choices, in the order every list draws them. The stored value of "From this page" stays `direct`. */
export const ROUTE_OPTIONS = [
  { value: "auto", label: ROUTE_NAMES.auto },
  { value: "direct", label: ROUTE_NAMES.page },
  { value: "bridge", label: ROUTE_NAMES.bridge },
] as const;

/** The route strip, before a send. The whole strip is one accessible string. */
export const strip = {
  // Where the request will leave from, one line per route setting. The host has a stop of its own.
  autoWithBridge: "From this page, then the Local Bridge if it fails",
  fromPage: "From this page",
  throughBridge: "Through the Local Bridge",
  secrets: (names: readonly string[]) => `${names.length === 1 ? "Uses secret" : "Uses secrets"}: ${names.join(", ")}`,
  scriptsHeld: (n: number) => `${n} ${n === 1 ? "script" : "scripts"} held`,
  scriptsTrusted: (n: number) => `${n} ${n === 1 ? "script" : "scripts"} trusted`,
  variables: (n: number) => `${n} ${n === 1 ? "variable" : "variables"}`,
  missingVariable: (name: string, environment: string) =>
    `{{${name}}} has no value in environment "${environment}". Set a value.`,
  missingVariableNoEnvironment: (name: string) => `{{${name}}} has no value. Set a value.`,
  badAddress: "Not an address. Write it as https://host/path.",
  typedCurl: "This looks like a cURL command. Import it.",
  typedCurlAction: "Import as request",
  typedMethodAndAddress: (method: string, address: string) => `Use ${method} for ${address}?`,
  typedMethodAction: "Use it",
  needsAddress: "Enter an address to send.",
  noHost: "No address yet",
  sendAnyway: "Send anyway",
  // The collapsed strip: one button, named by the whole strip.
  showAll: "Show the whole route",
} as const;

/** After a send, from the record. */
export const sent = {
  fromPage: "Sent from this page",
  throughBridge: "Sent through the Local Bridge",
  afterNoAnswer: "Sent through the Local Bridge after the page got no answer",
  // Never "not sent": C-007's wording is that a secret is masked where it is kept.
  secrets: (n: number) => `${n} ${n === 1 ? "secret" : "secrets"} sent, masked in history and exports`,
  inFlight: "Sending…",
  historyKept: "History kept this request. No response came.",
} as const;

/** The Sent part of the response: what the app built and sent, as history keeps it. */
export const sentPart = {
  tab: "Sent",
  browserAdds: "A browser adds its own headers (Host, User-Agent and others) that a page cannot see.",
  bridgeAdds:
    "The Local Bridge sent this from your computer. It adds headers of its own (Host and others) that are not listed here.",
  // Never "not sent": a secret goes out as its value; it is *** where the app keeps it.
  masked: "Vault secrets and credentials are *** here, as they are in history and exports.",
  noHeaders: "The app set no headers.",
  noBody: "No body was sent.",
  secrets: "Vault secrets filled",
  noSecrets: "Nothing was filled from the vault.",
  secretsNotRecorded: "Vault secrets filled: not recorded.",
  cut: (shown: number, of: number) =>
    `Showing the first ${shown.toLocaleString("en")} of ${of.toLocaleString("en")} characters.`,
} as const;

/** A failed send: headline, cause, next action, and what the disclosure is called. */
export const failures = {
  offline: {
    headline: "You are offline.",
    cause: "This device has no network connection, so nothing was sent.",
    next: "Reconnect, then send again.",
    action: "Send again",
  },
  unreachable: {
    headline: (host: string) => `No response from ${host}.`,
    cause:
      "The browser does not say why. The name may not resolve, the server may have refused the connection, or it does not allow requests from this page.",
    nextWithBridge: "Send through the Local Bridge",
    nextWithoutBridge: "Start the Local Bridge to see the real reason:",
    command: "npx wayfarer-bridge",
  },
  timeout: {
    headline: (took: string) => `No answer in ${took}.`,
    cause: (host: string) => `${host} did not respond before the timeout.`,
    next: "Raise the request timeout in Settings.",
    action: "Raise the timeout",
  },
  stopped: {
    headline: "Stopped.",
    cause: "You stopped this request. The server may already have received it.",
    next: "Send it again if you still want it.",
    action: "Send again",
  },
  refused: {
    headline: (host: string) => `${host} refused the connection.`,
    cause: "Nothing is listening at that address, or a firewall blocked it.",
    next: "Check the address and port, and that the server is running.",
    action: "Send again",
  },
  notFound: {
    headline: (host: string) => `Could not find ${host}.`,
    cause: "The name does not resolve from this computer.",
    next: "Check the spelling of the host.",
    action: "Send again",
  },
  certificate: {
    headline: (host: string) => `The certificate for ${host} was not accepted.`,
    cause: "It is expired, self-signed or issued for another name.",
    next: "Fix the certificate, or turn off certificate checking for this request in its Network tab. The response will say so.",
    action: "Open request settings",
  },
  bridgeDown: {
    headline: "The Local Bridge did not answer.",
    cause:
      "Nothing answered at the bridge's address. It may not be running, the address may be wrong, or it was not told to allow this page (--allow-origin).",
    next: "Start the bridge, or check its address in Settings.",
    action: "Open Local Bridge settings",
  },
  bridgeToken: {
    headline: "The Local Bridge did not accept the token.",
    cause: "The token saved here is not the one this bridge expects.",
    next: "Pair with the bridge again in Settings.",
    action: "Open Local Bridge settings",
  },
  bridgeVersion: {
    headline: "The Local Bridge does not understand this page.",
    cause: "The bridge and this page are of different versions.",
    next: "Update the Local Bridge and reload Wayfarer, then start the bridge again.",
    action: "Open Local Bridge settings",
  },
  bridgeOther: {
    headline: "The Local Bridge could not send this request.",
    cause: "The bridge reached no answer it could pass on. What it said is below.",
    next: "Read what it said, then send again.",
    action: "Send again",
  },
  detailsBrowser: "What the browser reported",
  detailsBridge: "What the bridge reported",
  detailsShow: "Details",
  panel: "Why there was no response",
} as const;

/** The Timings part: the strip of phases, and what it says about where they came from. */
export const timing = {
  strip: "Where the time went",
  sourceBrowser: "Phases from the browser.",
  sourceBridge: "Phases from the Local Bridge.",
  totalOnly: "Total only: this server does not share timing.",
  notRecorded: "Timings: not recorded. History keeps the total only.",
  unaccounted: "Not measured",
} as const;

export const empty = {
  collections: {
    headline: "No collections yet.",
    body: "Save a request to start one, or bring in a collection you already have.",
    actions: ["New collection", "Import"],
  },
  history: {
    headline: "Nothing sent yet.",
    body: "Every request you send is kept here, on this device.",
    action: "Send a request",
  },
  environments: {
    headline: "No environments yet.",
    body: "An environment holds values such as a base address or a token, so one request works against staging and production.",
    actions: ["New environment", "Import"],
  },
  response: {
    headline: "Send a request to see what comes back.",
    body: "Type an address above and press Enter, or try an example.",
    actions: ["Try an example", "Paste a cURL command"],
  },
  notSent: { headline: "Not sent yet.", body: (keys: string) => `${keys} sends it. The response appears here.` },
  vault: {
    headline: "No vault yet.",
    body: "The vault keeps secrets such as API keys encrypted with a passphrase only you know. Set it up before you add a secret.",
    action: "Set up vault",
  },
  tests: {
    headline: "No tests on this request.",
    body: "A test checks the response, for example that the status is 200.",
    action: "Add a test",
  },
  testsHeld: {
    headline: "Scripts did not run, so their tests did not either.",
    body: "They are not reviewed yet. Review them to run them on the next send.",
    action: "Review scripts",
  },
} as const;

export const scriptReview = {
  title: "Review scripts",
  lead: "These scripts run on your computer when you send. Read them before you trust them.",
  flags: {
    sendRequest: "Calls pm.sendRequest: it can send other requests from this page.",
    variables: "Reads or writes variables: pm.environment, pm.collectionVariables.",
    vault: "Asks for secrets: pm.vault.",
  },
  counts: (scripts: number, lines: number) => `${scripts} ${scripts === 1 ? "script" : "scripts"}, ${lines} lines.`,
  trust: "Trust these scripts",
  notNow: "Not now",
  trusted: "Scripts trusted. They run when you send.",
  held: (n: number) => `${n} ${n === 1 ? "script" : "scripts"} held. They did not run.`,
  heldAction: "Review scripts",
} as const;

export const compare = {
  menuItem: "Compare with...",
  first: "Compare with this",
  comparing: (a: string, b: string) => `Comparing ${a} with ${b}`,
  noBodies: "Bodies were not kept for this entry, so only status and headers are compared.",
  gaps: ["Timings: not recorded.", "Tests: not recorded.", "Body: not recorded."],
  nothingDiffers: "Nothing differs.",
  masked: "Secret values are masked in both.",
} as const;

export const statusBar = {
  route: (route: "Auto" | "From this page" | "Local Bridge") => `Route: ${route}`,
  bridge: { off: "Bridge: not paired", on: "Bridge: paired", name: "Local Bridge settings" },
  vault: {
    none: "Vault: not set up",
    locked: "Vault: locked",
    unlocked: (secrets: number) => `Vault: unlocked, ${secrets} ${secrets === 1 ? "secret" : "secrets"}`,
    set: "Set up vault",
    unlock: "Unlock vault",
    lock: "Lock vault",
  },
  backup: {
    none: "Not backed up",
    done: (age: string) => `Backed up ${age}`,
    tip: "Everything is stored in this browser. The browser can clear it. Export a backup to keep a copy.",
  },
  theme: (choice: "System" | "Light" | "Dark") => `Theme: ${choice}`,
} as const;

export const firstRun = {
  placeholder: "Paste a cURL command or type an address",
  example: "GET https://jsonplaceholder.typicode.com/todos/1",
  result: (host: string, status: string, ms: number) => `Sent from this page to ${host}. ${status}, ${ms} ms.`,
} as const;

export const importing = {
  menu: ["File...", "cURL command...", "Link..."],
  report: (requests: number, folders: number, hosts: readonly string[]) =>
    `${requests} ${requests === 1 ? "request" : "requests"} in ${folders} ${folders === 1 ? "folder" : "folders"} go to: ${hosts.join(", ")}.`,
  footer: "Nothing is stored until you choose Import.",
  done: (name: string) => `Imported ${name}. Undo.`,
} as const;

export const vaultSetup = {
  lead: "The vault keeps secrets encrypted on this device. Set it up with a passphrase only you know.",
  title: "Set up vault",
  fields: ["Passphrase", "Confirm passphrase"],
  note: "There is no way to recover a forgotten passphrase.",
  reveal: "Show passphrase",
  storeAsSecret: "Store as a secret",
  palette: ["Set up vault", "Unlock vault", "Add a secret"],
} as const;
