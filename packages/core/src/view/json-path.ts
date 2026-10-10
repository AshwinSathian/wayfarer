// A segment no path can spell: `[*]`, as opposed to a key that is a star.
const EVERY = "\u0000";

/**
 * Reads a dot path out of a JSON value: `data.items[0].id`. `[*]` takes every
 * item of an array (or every value of an object) and gives a list of what the
 * rest of the path finds in each; a second `[*]` keeps the list flat.
 *
 * Own keys only: the path is the user's text, and `constructor` must not
 * find one.
 */
export function evaluatePath(value: unknown, path: string): unknown {
  return walk(value, path.replace(/\[\*\]/g, `.${EVERY}`).replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean));
}

function walk(value: unknown, segments: string[]): unknown {
  let current = value;
  for (const [index, segment] of segments.entries()) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (segment === EVERY) {
      const rest = segments.slice(index + 1);
      const items: unknown[] = Array.isArray(current) ? current : typeof current === "object" ? Object.values(current) : [];
      return items.flatMap((item) => {
        const found = walk(item, rest);
        return found === undefined ? [] : rest.includes(EVERY) ? (found as unknown[]) : [found];
      });
    }
    const holder: object = Object(current);
    current = Object.hasOwn(holder, segment) ? (holder as Record<string, unknown>)[segment] : undefined;
  }
  return current;
}
