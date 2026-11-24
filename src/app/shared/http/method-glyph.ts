export type MethodGlyph = "ring" | "dot" | "bar";

/**
 * The mark drawn before a method's name, which a colour-blind reader tells apart where the hues of PUT, PATCH and
 * OPTIONS are close: a ring for a method that reads (GET, HEAD, OPTIONS), a bar for DELETE, a dot for every other
 * token, a method of the user's own among them. Case does not matter.
 */
export function methodGlyph(method: string): MethodGlyph {
  const name = method.toUpperCase();
  if (name === "GET" || name === "HEAD" || name === "OPTIONS") return "ring";
  return name === "DELETE" ? "bar" : "dot";
}
