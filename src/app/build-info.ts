declare const WAYFARER_COMMIT: string | undefined;

/** The commit the app was built from: `npm run build` gives it (`--define`); a development server has none. */
export const COMMIT = typeof WAYFARER_COMMIT === "string" && WAYFARER_COMMIT ? WAYFARER_COMMIT : "development";
