---
title: The 3.0 redesign, screen by screen
date: 2026-11-05
description: Wayfarer 3.0 is a workspace of fixed panes, a tree that opens a request on one click, and a run report you can read. Here is what changed, before and after.
---

Wayfarer 2.x did its job, but it was laid out like a web page. Between 19
October and 4 November we reviewed every screen in Chromium, Firefox and WebKit, at phone and
desktop widths, and wrote each problem down with a number and a severity.
3.0 is what came of that review. This post is the short version; every
finding that blocked a task or misled someone is on
<a href="/what-changed-in-3-0/">What changed in 3.0</a>, with its before
and after.

## The response is on the first screen

<!-- screen response -->

In 2.x the page scrolled. With a response open in a 1,440 by 900 window,
its body started 700 px down, and the environments were below the
composer, past the end of the window. In 3.0 the window is a set of panes:
the sidebar, the request and the response each scroll inside themselves.
You can move the split between the request and the response, and it is
remembered. <!-- claims C-031 -->

The route, the redirects and the certificate check sat above every request,
with a sentence each. They are now the request's Network tab, and the
address is followed by the request's own tabs.

## One click opens a request

A click on a request in the tree used to select it, and opening it took a
double click. The tree showed names only. Now one click opens a request,
and each row starts with its method in the method's colour. <!-- claims C-024 -->

## A run you can read

<!-- screen run -->

A run of 42 requests that failed for one reason printed the same three
lines 42 times, with no count and no way to see the failures alone. A run
now shows how many passed and failed, a Failed only filter, and a cause the
requests share once. Each row opens its request in a tab of its own, and
the report downloads as JSON, JUnit XML or HAR.

## When a request gets no response

2.x said "0 Unknown Error" both for a host that does not exist and for a
server that sends no CORS header. 3.0 says the request got no response and
quotes what the browser reported, with no status code made up. <!-- claims C-010 -->
When no Local Bridge is paired, the request's record
shows the command that starts one, with Copy and a field for its pairing
code.

## What a picture does not show

A screen reader now hears a send's result when it arrives, and hears an
error that appears after an action. Every control's name contains its
visible words, so voice control can reach it by what it says. The edge of
every control is at least 3:1 against its surface, text grows with your
browser's text size, and every screen fits a 320 px window. The main views
and dialogs have no axe violation of WCAG 2.2 A and AA. <!-- claims C-038 -->

The rest of what 3.0 changed is in [the changelog](../../../../CHANGELOG.md).
