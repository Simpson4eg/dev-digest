# `@devdigest/e2e` — browser end-to-end suite

Deterministic UI flows for the web app, driven by
[Vercel **agent-browser**](https://github.com/vercel-labs/agent-browser) — a
native (Rust + CDP) browser-automation CLI. **No Playwright, no LLM, no API
key.**

agent-browser is a CLI, not a test framework, so this package adds a thin
convention: each flow is a JSON list of agent-browser commands, run in order
against one shared browser session by `run.ts`.

Uses **npm** (not pnpm).

## Quick start

```sh
# 1. install agent-browser once (downloads Chrome for Testing)
npm i -g agent-browser && agent-browser install

# 2. hermetic run (recommended) — isolated stack on alternate ports
./scripts/e2e.sh           # from repo root

# OR: against your own running stack (only safe with a freshly-seeded dev DB)
./scripts/dev.sh           # Postgres + API + web, seeded
cd e2e && npm install && npm test
```

> **Precondition: a freshly-seeded DB.** Flows 02 / 04 / 05 assume the seeded
> demo repo is the only one. CI guarantees this; the hermetic runner spins up
> an isolated, ephemeral Postgres so it stays true.
>
> ⚠️ **Never `docker compose down -v` to reset your dev DB** — `-v` deletes the
> `devdigest_pgdata` volume along with every real repo you've imported.

## Where to look

- **For agents / contributors:** [`CLAUDE.md`](./CLAUDE.md) (runner shape, flow
  conventions, gotchas).
- **How-to** in [`docs/`](./docs/):
  - [`writing-flows.md`](./docs/writing-flows.md) — authoring a flow
  - [`debugging.md`](./docs/debugging.md) — failure triage + envs
- **Contract** in [`specs/`](./specs/):
  - [`flow-format.md`](./specs/flow-format.md) — formal JSON shape
  - `NN-name.flow.json` — the flows themselves

## Coverage (typological, not exhaustive)

| Spec                  | Flow                                                                          |
|-----------------------|-------------------------------------------------------------------------------|
| `01-app-boot`         | root → redirect to first repo's PR list → seeded PR #482                      |
| `02-repo-pulls-detail`| PR list → open PR #482 → review detail route                                  |
| `03-agents`           | agents list renders the seeded reviewer agents                                |
| `04-pr-findings`      | PR #482 → Agent runs tab → seeded run verdict + findings; expand → FindingCard|
| `05-pr-diff`          | PR #482 → Files changed tab → seeded file renders in the diff viewer          |
| `06-onboarding`       | `/onboarding` → add-repository form renders (no submit)                       |
| `07-settings`         | `/settings/api-keys` + `/settings/models` → section titles render             |

Failure screenshots → `e2e/test-results/` (git-ignored; CI artifact via
`.github/workflows/e2e-web.yml`). See [`../TESTING.md`](../TESTING.md).
