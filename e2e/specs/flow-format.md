# Flow JSON format

Formal contract for `specs/NN-name.flow.json` files consumed by `run.ts`.

## Schema

```ts
type Flow = {
  name: string;            // human-readable title
  steps: Step[];
};

type Step = {
  cmd: string[];           // args passed verbatim to agent-browser
  label?: string;          // printed before execution
  assert?: {
    stdoutIncludes?: string; // substring check against the command's stdout
  };
};
```

The runner does not validate the JSON with Zod (yet); shape mismatches surface
as runtime errors.

## Runtime substitutions

In every string in `step.cmd[]`:

- `{BASE}` → `process.env.E2E_BASE_URL` (default `http://localhost:3000`).

No other substitutions are performed.

## Execution model

- `run.ts` reads `specs/*.flow.json` in lexical order.
- For each flow:
  1. Print `name`.
  2. For each step: print `label`, spawn `agent-browser` with `cmd`.
  3. Non-zero exit → fail the flow, dump screenshot, continue to next flow.
- After all flows: exit non-zero if any failed.

## Allowed commands (current)

| Command           | Purpose                                    |
|-------------------|--------------------------------------------|
| `open <url>`      | navigate                                   |
| `wait --url <s>`  | wait until URL contains `<s>` (assertion)  |
| `wait --text <s>` | wait until visible text contains `<s>`     |
| `find role <r>`   | locate by ARIA role                        |
| `find text <s>`   | locate by visible text                     |
| `find label <l>`  | locate by label association                |
| `click`           | click last located element                 |
| `type <s>`        | type text                                  |
| `press <key>`     | press a key                                |

Forbidden: `chat` (AI). The whole point is determinism.

## Failure artifacts

Screenshots → `e2e/test-results/<flow-name>__<step-label>.png`. Git-ignored;
CI uploads them on failure.

## Invariants

- Flows are **idempotent and read-only** against the seeded DB.
- A flow does not depend on the state left by a previous flow beyond a logged-in
  session (the demo has no auth in the starter).
- Locators are deterministic (`--url`, `--text`, `role`, `label`).

## See also

- `../docs/writing-flows.md` — author guide
- `../docs/debugging.md` — failure triage
- `../CLAUDE.md` — runner shape
