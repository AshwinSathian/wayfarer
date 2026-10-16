// The docs' search (W2.2): Pagefind's interface over the index the build writes to /pagefind/.
// A file, not an inline script: the docs' CSP allows script from the site's own files only.
new PagefindUI({ element: "#search", showSubResults: true });
