# Run retro ledger

One line per SDD workflow run, appended by the **`workflow-retro`** skill so runs can be
compared over time. This is the trend surface — the per-run detail lives in the retro report the
skill prints; only the comparable headline lands here.

Columns:

- **date** — run date (YYYY-MM-DD).
- **run** — feature / `PLAN-NN` the run implemented.
- **mode** — `in-context` (fast, underestimates nested subagents) or `deep` (read from the
  transcript on disk; accurate nested accounting).
- **agents** — which pipeline agents ran (and ×N for fan-out).
- **tokens** — in / out / cache-read (∑ across parent + nested subagents).
- **cache-hit** — cache-read ÷ total input.
- **tool-calls** — total tool invocations.
- **wall** — wall-clock duration.
- **top action** — the single highest-value change the retro recommends for next time.

| date | run | mode | agents | tokens (in/out/cache) | cache-hit | tool-calls | wall | top action |
|------|-----|------|--------|-----------------------|-----------|------------|------|------------|
<!-- workflow-retro appends rows below this line -->
