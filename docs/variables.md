# Variables

Write `{{name}}` in the URL, a header, the body or an Auth field, and Wayfarer puts the variable's value there when the request is sent. The chips under the address bar show each variable of the request, where its value comes from, and the value.

## Where a value comes from

A name is looked up in this order, and the first place that has it gives the value:

1. **The active environment.** Edit it in the Environments panel.
2. **The folders** the request is in, the nearest folder first. Right-click a folder, choose **Settings**, then **Variables**.
3. **The collection** the request is saved in. Right-click the collection, choose **Settings**, then **Variables**. A request that is not saved in a collection has none, and no folder's.
4. **Global variables.** The **Global variables** button in the Environments panel. They apply whichever environment is active.

Two more scopes are looked up before these and have no editor yet: variables a script sets for one request, and the rows of a data file in a collection run. Both arrive with the features that fill them.

Only names you defined are variables. `{{constructor}}` is not one.

## A value that holds a variable

A value may hold `{{names}}` itself: with `url` set to `https://{{host}}/v1` and `host` set to `api.test`, `{{url}}` is `https://api.test/v1`. The two can be in different places. A value may pass through at most 10 variables.

Variables that refer to each other in a circle are not sent. The composer says which: `Variables refer to each other in a circle: {{a}} → {{b}} → {{a}}.`

## Dynamic variables

These give a new value every time they are used, also twice in one request.

| Variable | Value |
|---|---|
| `{{$guid}}`, `{{$randomUUID}}` | A random version 4 UUID |
| `{{$timestamp}}` | The time now, in seconds since 1970 |
| `{{$isoTimestamp}}` | The time now, as ISO 8601 |
| `{{$randomInt}}` | A whole number from 0 to 1000 |
| `{{$randomAlphaNumeric}}` | One letter or digit |

Random values come from the browser's `crypto.getRandomValues`.

## A variable that has no value

A request with a `{{name}}` that has no value anywhere is not sent. The composer says which variable and offers **Send anyway**, which sends it as written. Settings, "Hold back a request with a variable that has no value", switches this off: the variable is then sent as written, as Postman does. The chips list it under "Missing" either way.

## Secrets

A protected variable holds `{{$secret.<id>}}`, a reference to a value in the vault. It is resolved when the request is sent, and its value is never read for further variables: a secret that reads `{{token}}` is sent as that text. See [Secrets](secrets.md).

## Two tabs

A save in a variables editor writes what you changed, not the whole list, so a variable added in another tab meanwhile is kept.
