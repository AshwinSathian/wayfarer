# GraphQL

A request's body can be a GraphQL query. Choose **GraphQL** in the Body
tab: the tab then has an editor for the query, one for its variables, and
**Fetch schema**.

## What is sent

One JSON object, as GraphQL over HTTP has it:

```json
{ "query": "query Pet($id: ID!) { pet(id: $id) { name } }", "variables": { "id": "7" } }
```

- **The query** is sent as you wrote it, as one JSON string.
- **The variables** are a JSON object. Left empty, the object names no
  `variables`. Text that is not JSON, or JSON that is no object, is not
  sent: the composer says which.
- **`{{variables}}` of the app** are replaced in the query and in the
  variables' text before the JSON is made. In the variables' text a value
  lands inside JSON, so a value with a quote in it breaks it, as in any
  JSON body; in the query it cannot break the JSON.
- **`Content-Type`** is `application/json` unless a header sets another.
- The method is the request's own. Most servers want `POST`; `GET` and
  `HEAD` send no body, as for every body.

A copied cURL command, generated code, a HAR and a script's `pm.request`
have the body as that JSON text. A Postman collection is written with a
GraphQL body, and a Postman file's GraphQL body is read as one.

## The schema

**Fetch schema** sends the standard introspection query to the request's
address, as Send would send the request: its headers, its auth, its
scripts, the Local Bridge when it is on. Its assertions do not run, and
nothing is written to history.

With a schema:

- **The query is checked as you type.** A field the schema does not have,
  an argument of the wrong type and the like are underlined in the editor
  and listed under it with their line.
- **The editor completes** fields, arguments and types at the cursor.
- **The schema is listed** under the editors: the query, mutation and
  subscription types first, then the others by name, each with its fields,
  their arguments and types, and the schema's own descriptions.

Without one, a query that does not parse is still said.

A schema is kept for the address as it is written in the request, in the
page's memory: **Refresh schema** asks again, and a reload forgets it. When
a refresh fails, the schema that was there stays, and the reason is shown.

## What there is not

- A server that does not allow introspection gives no schema; the pane
  says what the server answered. A schema cannot be loaded from a file.
- Subscriptions over WebSocket are not run. A query or a mutation is sent.
- The check runs in the page, a moment after the last key. A very large
  schema may be felt while typing.
- No formatter for the query, and no history of queries besides the
  request's own.
