---
name: semver-discipline
type: convention
description: Enforce correct semver bump decisions — flag breaking changes that ship without a major version bump.
---

# semver-discipline

Flag PRs that introduce a breaking API change without bumping the **major** version, or that bump the major version when no breaking change is present.

## Rule

Per [SemVer 2.0.0](https://semver.org/):

| Change type | Required bump |
|-------------|---------------|
| Backwards-incompatible API change | **MAJOR** (X.y.z) |
| New backwards-compatible functionality | MINOR (x.Y.z) |
| Backwards-compatible bug fix | PATCH (x.y.Z) |

Report as `CRITICAL` when:
- A breaking change (removed/renamed route, field type change) is present **and** `package.json` version was not bumped to the next major.
- A major bump is present **without** any breaking change (indicates incorrect release discipline).

Cite both the breaking-change line and the `package.json:version` line.

## BAD — breaking change, only patch bump

```diff
// routes/users.ts
-router.delete('/users/:id', handler)

// package.json
-"version": "2.3.1"
+"version": "2.3.2"
```

Removing a route is a breaking change → must be `3.0.0`.

## GOOD — breaking change with major bump

```diff
// routes/users.ts
-router.delete('/users/:id', handler)

// package.json
-"version": "2.3.1"
+"version": "3.0.0"
```

Plus CHANGELOG entry and migration guide.

## BAD — unnecessary major bump

```diff
// adds a new optional field — backwards compatible
+"version": "3.0.0"
```

New optional field is a MINOR change → use `2.4.0`.
