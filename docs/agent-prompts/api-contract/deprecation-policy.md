---
name: deprecation-policy
type: convention
description: Ensure deprecated endpoints/fields are marked and not silently removed; enforce the notice → sunset → removal lifecycle.
---

# deprecation-policy

Flag any change that **silently removes or disables** a public API element that was in use, without prior deprecation notice.

## Rule

Public API elements (routes, fields, parameters, enums) must follow a three-step lifecycle before removal:

1. **Deprecation notice** — add `@deprecated` annotation, HTTP header `Deprecation: true` / `Sunset: <date>`, or a `deprecated: true` field in the OpenAPI spec.
2. **Sunset period** — the element continues to work for a defined period (e.g. one major version or 90 days).
3. **Removal** — only after the sunset date has passed and callers have been notified.

Report as `CRITICAL` when an element is removed without step 1 having occurred in a previous release. Report as `WARNING` when step 1 is present but step 2 (sunset date) is missing.

## BAD — silent removal with no prior deprecation

```diff
-router.get('/v1/legacy-search', legacySearchHandler)
```

No `@deprecated` comment, no Deprecation header, no CHANGELOG entry → callers receive unexpected 404.

## GOOD — staged deprecation

```ts
// v2.1.0 — deprecation notice added
router.get('/v1/legacy-search', (req, res, next) => {
  res.set('Deprecation', 'true');
  res.set('Sunset', 'Sat, 01 Jan 2026 00:00:00 GMT');
  return legacySearchHandler(req, res, next);
});
```

```diff
// v3.0.0 — removed after sunset date
-router.get('/v1/legacy-search', ...)
```

CHANGELOG entry references the v2.1.0 deprecation announcement.

## BAD — deprecated field removed in same PR as deprecation

```diff
+/** @deprecated use `user_id` instead */
-userId?: string;
```

Deprecation and removal must be in **separate releases**.

## GOOD — two-release cycle

Release N: add `@deprecated` annotation, keep field working.
Release N+1: remove field after consumers have migrated.
