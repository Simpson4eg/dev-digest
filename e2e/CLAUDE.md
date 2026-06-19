# e2e/ — `@devdigest/e2e` (deterministic browser flows)

Browser end-to-end tests for the web app, driven by Vercel
**agent-browser** (Rust + CDP). **No Playwright, no LLM, no API key.**

## Run / verify

| What                       | Command                                       |
|----------------------------|-----------------------------------------------|
| install agent-browser once | `npm i -g agent-browser && agent-browser install` |
| typecheck                  | `npm run typecheck`                           |
| hermetic (recommended)     | `./scripts/e2e.sh` (from repo root)           |
| against running stack      | `npm test` (only safe with a fresh-seeded DB) |

Uses **npm**, not pnpm — there's a `package-lock.json` here. Don't run
`pnpm install`.

## Layout

| File / dir             | what                                                      |
|------------------------|-----------------------------------------------------------|
| `run.ts`               | thin runner: reads each spec, executes commands in order against one shared browser session |
| `agent-browser.json`   | CLI config for agent-browser                              |
| `specs/NN-name.flow.json` | flows — JSON arrays of agent-browser commands          |

## Flow shape

```jsonc
{
  "name": "App boots and lands on the seeded repo's PR list",
  "steps": [
    { "cmd": ["open", "{BASE}/"],         "label": "load root" },
    { "cmd": ["wait", "--url", "/pulls"], "label": "redirects to PRs" },
    { "cmd": ["wait", "--text", "#482"],  "label": "seeded PR visible" }
  ]
}
```

- `{BASE}` is replaced with `E2E_BASE_URL` (default `http://localhost:3000`).
- Each `cmd` is passed verbatim to `agent-browser`. Non-zero exit fails the step
  → `wait --text` / `wait --url` **are** the assertions (they time out and fail
  if the condition never holds).
- Optional `"assert": { "stdoutIncludes": "…" }` adds a substring check on stdout.
- Locators are deterministic only (`--url`, `--text`, `find role|text|label`).
  Never use the AI `chat` command — runs must stay stable and key-free.

## Non-default conventions

- **One numbered prefix per flow** (`NN-name.flow.json`). Numbering reflects
  intended execution order; `run.ts` reads them in lexical order.
- **Read-only seeded data.** Flows target the seeded demo repo
  `acme/payments-api`, PR #482, the seeded agents. No mutations.
- **Each flow is a self-contained scenario** — don't share browser state between
  flows beyond what one session of `run.ts` happens to carry.

## Gotchas

- **Precondition: a freshly-seeded DB.** Flow `02` follows the home redirect to
  the *first* repo. If your dev DB has other imported repos, flows 02 / 04 / 05
  land on the wrong repo and fail.
- **Never `docker compose down -v` to reset your dev DB.** `-v` deletes the
  `devdigest_pgdata` volume along with every real repo you've imported. Use
  `./scripts/e2e.sh` — it spins up an isolated, ephemeral Postgres on alternate
  ports and never touches your dev DB.
- **agent-browser is a CLI, not a framework.** No fixtures, no hooks, no
  `beforeEach`. Anything stateful goes in the JSON spec.

## Do-not-touch

- Existing flow JSON shape (`name`, `steps[].cmd`, `steps[].label`, optional
  `assert`). The runner depends on it.

## See also

- `README.md` — onboarding + run details
- `docs/writing-flows.md` — authoring a new `NN-name.flow.json`
- `docs/debugging.md` — how to gnaty flow against a running stack
- `specs/flow-format.md` — formal contract for the JSON shape
- `INSIGHTS.md` — non-obvious знахідки з file:line (накопичується skill'ом)
- `../CLAUDE.md` — глобальна карта репо
