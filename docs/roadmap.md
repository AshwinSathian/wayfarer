# Roadmap

What shipped in 3.0 and since, what is next, and the work for teams after
that. Each line is what you get; [the changelog](../CHANGELOG.md) says
what each release changed. The site's [roadmap page](https://wayfarer.ashwinsathian.com/roadmap/)
is made from this file.

## Shipped in 3.0

- Every response comes with a record of where the request went: the route it took, the host, which secrets were filled in (by name, never by value) and what History kept. <!-- claims C-008 -->
- Before you send, the composer shows the address as it will go out, where each variable's value comes from, and which ones have no value yet. <!-- claims C-025 C-045 C-049 -->
- A reply that takes under a second appears at once, with no spinner first, and the status line gives the time it really took.
- From an empty app to a first response in two steps: paste or type an address, then Send.
- A new look in light and dark: one ink colour for everything you act on, colour kept for methods and status codes, and type in which 0 and O, or l and 1, never look alike. <!-- claims C-037 -->
- The app's words rewritten to say plainly what happened and what you can do next.
- The core flow works from the keyboard alone, the main views and dialogs have no accessibility violation an automated scan finds, and every view holds at 320 px wide. <!-- claims C-038 C-067 -->
- Environments open in a tab, as a request does, and save each row as you leave it. A deleted request, folder or environment can be put back for 10 seconds.
- Collection runs and their reports look and read the same in the app and on the command line. <!-- claims C-065 -->
- Settings in one place, with the Local Bridge, routes, import and export each in a section of its own. <!-- claims C-033 -->
- If you add an AI provider, it can draft a request from a description, write tests from a response and explain a failed one. You see every byte before it leaves, and nothing changes until you accept it. <!-- claims C-069 C-071 C-073 -->
- The installed app follows your theme and fits a phone's screen. <!-- claims C-036 -->

## Shipped since 3.0

- Fixes for the rough edges found in the last review before 3.0.
- Share a collection with your team as a file, or as a link whose encrypted contents never reach a server, and see every host it sends to before you import it. <!-- claims C-084 C-086 C-090 -->

## Next

- Keep collections in a Git repository, and see each change and its diff before you take it.

## Later

- Work on the same collection as your team in real time, end-to-end encrypted, with no server of ours in between.
- Run a Wayfarer server of your own for your team, from one Docker image.
