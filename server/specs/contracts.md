# Zod contract index

The source of truth for API shapes lives in `src/vendor/shared/contracts/`
(package `@devdigest/shared`). Routes use `fastify-type-provider-zod` so one
schema drives request validation **and** response serialization.

The client receives a vendored read-only copy at `client/src/vendor/shared/`;
edit only the server-side originals — the copy propagates from here.

## Files

| File                | Covers                                                          |
|---------------------|-----------------------------------------------------------------|
| `review-api.ts`     | `FindingRecord`, `ReviewRecord`, `ReviewRunResponse` — public review API shape |
| `findings.ts`       | `Finding`, `Verdict`, grounding contracts                       |
| `brief.ts`          | `Intent`, `SmartDiff` — brief/context layer (filled by lessons) |
| `platform.ts`       | settings, providers, workspace                                  |
| `knowledge.ts`      | memory, conventions                                             |
| `eval-ci.ts`        | `evalCases`, `evalRuns`, composed reviews                       |
| `productionize.ts`  | CI installation, runs, hooks                                    |
| `trace.ts`          | run traces (observability surface)                              |
| `observability.ts`  | structured logging contracts                                    |
| `why.ts`            | explanation / intent tracing                                    |

## Conventions

- One file per **domain**, not per route.
- Schemas are `z.object({...})` exports plus `type X = z.infer<typeof X>`. The
  inferred type is the public TS shape.
- Discriminated unions for variant types (e.g. `Verdict`).
- Schema names match the runtime resource (`FindingRecord`, not `IFinding`).

## Adding a new contract

1. If a related domain file exists, extend it. Otherwise create a new file.
2. Export both the schema and the inferred type.
3. Re-run `pnpm typecheck` in both `server/` and `client/`.
4. Mirror the file in `client/src/vendor/shared/contracts/`? **No** — the
   vendoring is managed; just keep the server-side authoritative.

## See also

- `CLAUDE.md` — schema-first route convention
- `docs/adding-a-module.md` — where contracts fit in a new module
- `specs/api.md` — endpoint map (routes that consume these contracts)
