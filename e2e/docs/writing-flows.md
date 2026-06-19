# Writing a flow

A flow is a JSON file under `specs/NN-name.flow.json`. The runner (`run.ts`)
executes its steps in order against one shared browser session.

## Filename

`NN-short-name.flow.json` — `NN` is a 2-digit prefix that fixes execution
order. Pick the next free number (currently `07` is the highest). Keep names
short and topical: `08-comments`, not `08-pr-comments-render-correctly`.

## Top-level shape

```jsonc
{
  "name": "Human-readable scenario title",
  "steps": [
    { "cmd": ["open", "{BASE}/"],            "label": "load app root" },
    { "cmd": ["wait", "--url", "/pulls"],    "label": "redirect to PR list" },
    { "cmd": ["wait", "--text", "#482"],     "label": "seeded PR visible" }
  ]
}
```

| Key              | What                                                                |
|------------------|---------------------------------------------------------------------|
| `name`           | Title used in runner output.                                        |
| `steps[]`        | Ordered command list.                                               |
| `steps[].cmd`    | Args passed verbatim to `agent-browser`.                            |
| `steps[].label`  | Human description; printed when the step runs.                      |
| `steps[].assert` | Optional: `{ "stdoutIncludes": "…" }` for a substring check on stdout. |

`{BASE}` in any argument is replaced with `E2E_BASE_URL` (default
`http://localhost:3000`).

## Allowed commands

- `open <url>` — navigate.
- `wait --url <fragment>` — wait until URL contains the fragment. **This is an
  assertion** — failure to satisfy by `E2E_STEP_TIMEOUT` (default 60s) fails the
  step.
- `wait --text <text>` — wait until visible text matches. Also an assertion.
- `find role <role> [--text <text>]` / `find text <text>` / `find label <label>`
  — deterministic locators.
- `click`, `type`, `press` — interaction commands; consult agent-browser docs
  for arg shapes.

## Forbidden

- **No `chat`** (AI-driven step). Runs must be deterministic and key-free.
- **No mutations against the real API.** Stick to read-only seeded data
  (`acme/payments-api` #482, seeded agents).
- **No hard-coded waits** (`sleep`). Use `wait --url` / `wait --text`.

## Authoring loop

1. Bring up the hermetic stack: `./scripts/e2e.sh --hold` (if supported) or run
   `npm test` against your dev stack only when the precondition holds.
2. Draft the flow JSON.
3. Run the runner — failures dump a screenshot to `e2e/test-results/`.
4. Once green, commit the JSON.

## See also

- `docs/debugging.md` — failure diagnosis
- `specs/flow-format.md` — formal contract
