# INSIGHTS — <package-name>

Non-obvious engineering findings accumulated session by session. Append-only;
git-versioned; a draft under human review, not canonical truth.

Entry format:

```
- YYYY-MM-DD · <one-line gist> · evidence: `path/to/file.ts:42`
  <1–3 lines explaining why this matters and when it applies; actionable "cold">
```

Quality bar: if a reader of the code could derive this themselves, don't write
it. See `.claude/skills/capturing-insights/examples.md` for bad/good pairs.

## What Works

Patterns and solutions that solved a real problem here.

## What Doesn't Work

Antipatterns, dead ends, "we tried this and it broke X". Most-skipped section,
highest value — don't skip it.

## Codebase Patterns

Conventions and architectural decisions that aren't already in CLAUDE.md or
the code itself.

## Tool & Library Notes

Dependency quirks: version-specific behavior, undocumented limits, surprising
defaults, breaking changes between minors.

## Recurring Errors & Fixes

Error → fix pairs you've now seen twice. Include the exact error string when
possible so future grep finds it.

## Session Notes

Datestamped session summaries. Only write here when something substantive
happened — trivial work goes nowhere.

## Open Questions

Things you didn't fully resolve. Future-you (or the next person) picks them up.
