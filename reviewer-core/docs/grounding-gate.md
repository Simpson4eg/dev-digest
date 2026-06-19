# Grounding gate

The grounding gate is the engine's mechanical defense against hallucinated
citations. Every finding must point at a line that exists in the diff, or it's
dropped before the consumer sees it.

## What it does

`groundFindings(parsed, diff)`:

1. Parses the unified diff into a map of `{ file → Set<lineNumber> }`.
2. For each finding, looks up `(finding.file, [startLine..endLine])` in the map.
3. If **any** cited line maps to a real diff line, the finding survives.
4. Otherwise, it's dropped silently and counted in `groundingSummary`.
5. The score is **recomputed** from survivors — the model's `score` is ignored.

## What "exists in the diff" means

Added (`+`) and context lines are valid citations; removed (`-`) lines are not
(the reviewer is talking about the post-change file). Line numbers refer to the
**new** file as shown in the unified diff hunk headers.

## Why it's mechanical, not LLM-checked

A second LLM call to validate citations would:
- double the cost,
- inherit the same hallucination tendencies,
- add latency.

The diff parse is exact and free.

## Score recomputation

The persisted score on the `Review` record reflects only surviving findings.
A model that reports "score: 95" but has all of its findings dropped at the
gate will yield a much lower (or empty) persisted score. This is intentional:
the gate is the source of truth.

## Edge cases

- **Empty findings array** — the review is persisted with `verdict: 'approve'`
  if the model said so; otherwise the verdict reflects the model's choice.
- **Finding citing a file not in the diff** — dropped (the file wasn't changed).
- **Multi-line range** (`startLine` < `endLine`) — survives if any line in the
  range hits the diff.

## See also

- `docs/pipeline.md` — where grounding sits in the flow
- `specs/findings.md` — `Finding` shape
- `../server/docs/review-pipeline.md` — server orchestrates around this
