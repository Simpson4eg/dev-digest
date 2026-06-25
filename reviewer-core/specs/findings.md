# Finding / Verdict / Review

These shapes are owned by `@devdigest/shared` — the engine consumes them, it
doesn't define them.

## Source

`server/src/vendor/shared/contracts/findings.ts` (authoritative) +
`review-api.ts` (record-level API shape). The contract index lives at
[`../../server/specs/contracts.md`](../../server/specs/contracts.md).

## Finding (per-issue payload)

The model emits an array of findings; each one carries:

| field        | type                                    | notes                                                  |
|--------------|-----------------------------------------|--------------------------------------------------------|
| `file`       | `string`                                | path as it appears in the diff                         |
| `startLine`  | `number`                                | line number in the **new** file                        |
| `endLine`    | `number`                                | inclusive; equals `startLine` for single-line findings |
| `severity`   | `'CRITICAL' \| 'WARNING' \| 'INFO'`     | model-asserted, accepted                               |
| `category`   | `'security' \| 'perf' \| 'correctness' \| 'style' \| ...` | open enum                          |
| `title`      | `string`                                | short headline                                         |
| `rationale`  | `string`                                | why this is a problem                                  |
| `suggestion` | `string`                                | how to fix                                             |
| `confidence` | `number` (0–1)                          | optional; model self-report                            |

## Verdict

```
'approve' | 'comment' | 'request_changes'
```

The model picks the verdict; the consumer may override based on grounded
findings (e.g., persist `request_changes` if any `CRITICAL` survives).

## Review (the engine's output)

```ts
{
  verdict: Verdict,
  score: number,        // RECOMPUTED from survivors — model's score is ignored
  summary: string,
  findings: Finding[],  // post-grounding
}
```

## Grounding contract

A `Finding` is **valid** iff `(file, [startLine..endLine])` intersects a real
line in the diff. The gate is implemented in `grounding.ts`; the test for
"in the diff" is mechanical (parsed hunks), not LLM-checked.

## See also

- `docs/grounding-gate.md` — exact rules + edge cases
- `specs/llm-provider.md` — what the model receives + returns
- `../server/specs/contracts.md` — wider Zod contract index
