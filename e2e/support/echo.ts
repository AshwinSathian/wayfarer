// Base URLs of the local echo-server (e2e/support/echo-server.mjs), started
// by playwright.config.ts. e2e specs never call the internet (P1.2).
export const ECHO = "http://127.0.0.1:4300";
export const ECHO_SECOND_ORIGIN = "http://127.0.0.1:4301";
