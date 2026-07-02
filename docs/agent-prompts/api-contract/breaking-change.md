---
name: breaking-change
type: convention
description: Detect removal or rename of public API routes, fields, or parameters that break existing callers.
---

# breaking-change

Flag any change that removes or renames a **public** contract element — endpoint path, method, required parameter, or top-level response field — without a compatibility shim or migration guide.

## Rule

A **breaking change** is any diff that:
- Removes an endpoint (`DELETE /users/:id` disappears, no redirect registered)
- Renames an endpoint path segment (`/v1/orders` → `/v1/purchases`)
- Renames or removes a **required** request parameter or body field
- Removes a **top-level** response field that callers depend on
- Changes a field from optional to required (callers that omit it now fail)

Report as `CRITICAL` severity. Cite the exact `file:line` where the breaking element was removed or renamed.

## BAD — silently removes a route

```diff
- router.get('/users/:id', handler)
```

No redirect, no changelog entry → callers receive 404.

## GOOD — route removed with redirect + version note

```diff
+ router.get('/users/:id', (req, res) => res.redirect(301, `/v2/users/${req.params.id}`))
- router.get('/users/:id', handler)
```

Or: endpoint kept with `@deprecated` and removal date documented.

## BAD — field renamed without alias

```diff
- { "userId": "abc" }
+ { "user_id": "abc" }
```

Callers reading `response.userId` get `undefined`.

## GOOD — both names present during migration window

```json
{ "userId": "abc", "user_id": "abc" }
```

Or: only rename accepted after a major version bump with changelog.
