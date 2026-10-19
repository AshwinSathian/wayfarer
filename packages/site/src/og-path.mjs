// Where a page's social image is (W3.1 of PLAN-design.md): /og/ and the page's path, as a PNG. `/` is /og/index.png;
// `/docs/auth/` is /og/docs/auth.png. social-images.mjs writes them there, and each page's metadata names its own.
export function ogImagePath(path) {
  const trimmed = path.replace(/^\/|\/$/g, "");
  return `/og/${trimmed === "" ? "index" : trimmed}.png`;
}
