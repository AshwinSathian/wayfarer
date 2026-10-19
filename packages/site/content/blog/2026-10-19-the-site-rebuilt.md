---
title: The website, rebuilt, sends no React
date: 2026-10-19
description: The site moved from Astro to Next.js and Tailwind, then stopped sending React to the browser. What that took, and the numbers before and after.
---

The first version of this site was one page of plain text on a black
background. It said the right things and looked like nobody had designed
it. So the site was rebuilt with Next.js and Tailwind and given a look of
its own: the paper and ink of a survey map, with one route drawn across it
in the app's indigo. The front page now plays a request and lists every
request that left the tab, which is the thing Wayfarer most wants you to
know.

## The policy came first

The site's Content-Security-Policy allows no inline script, and Next writes
some into every page it exports. A nonce would need a server to add it to
each response, and this site is a folder of files. The first answer was a
build step that moved each of those scripts into a file of its own.

## Then the numbers

With React running in the browser, Lighthouse on the mobile preset scored
the front page 97 for performance on a laptop and 93 on the CI runner. The
gate is 95. The largest paint came at 2.8 seconds, and taking React's
scripts out of the page brought it to 1.7.

So React now runs only when the site is built. Next renders each page to
HTML, a build step takes every script Next adds back out, and what a page
does in the browser is one small file of the site's own, for the theme
switch and the front page's demo. The docs keep their search. Lighthouse scores
the front page 100 for performance, accessibility and SEO, and still 100
with the CPU slowed twelve times.

## What CI checks now

A test reads every page of the built site and fails if it finds one of
Next's scripts, an inline script, an inline handler or a `style`
attribute. Another plays the demo and checks that the theme switch changes
the theme the app reads, since the site and the app share it and share one
logo.
