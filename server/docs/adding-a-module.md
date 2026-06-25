# Adding a feature module

A module is a self-contained Fastify plugin under `src/modules/<feature>/`. Each
module owns its routes, service layer, and persistence access.

## Convention

```
src/modules/<feature>/
  index.ts          ← exports the module plugin
  routes.ts         ← Fastify route registration (schema-first via Zod)
  service.ts        ← business logic; no Fastify or DB types leaking out
  repository.ts     ← Drizzle queries
  *.test.ts         ← hermetic (mocked adapters)
  *.it.test.ts      ← integration (testcontainers Postgres) — when needed
```

When `repository.ts` grows past ~200 lines, split into
`repository/<aspect>.repo.ts` files and re-export from `repository/index.ts`.

## Steps

1. **Define contracts first.** Add or extend Zod schemas in
   `src/vendor/shared/contracts/<topic>.ts`. These drive both validation and
   response shapes. The vendored copy in `client/src/vendor/shared/` propagates
   from here — don't edit the client copy.
2. **Create the module folder** under `src/modules/<feature>/`.
3. **Write routes** in `routes.ts` using `fastify-type-provider-zod`:
   ```ts
   app.post('/things', { schema: { body: CreateThingBody, response: { 201: ThingRecord } } },
     async (req) => service.create(req.body)
   );
   ```
   The handler signature is fully typed from the Zod schemas.
4. **Service layer** receives adapters via the DI container
   (`platform/container.ts`). Inject ports (LLM, GitHub, …) at construction;
   never reach for `process.env` inside business logic.
5. **Register the module** in `src/modules/index.ts` — one import + one
   `app.register`. Order matters only if a later module depends on a hook
   registered earlier.
6. **Tests.** Hermetic by default (`*.test.ts`). If a test imports
   `test/helpers/pg.ts` (real Postgres), it MUST use the `*.it.test.ts` suffix or
   the CI suite split breaks.

## Plugins vs modules

Cross-cutting plugins (helmet, cors, rate-limit, SSE, error handler) register
**before** any module plugin. Modules inherit them via Fastify's encapsulation.

## Rate limiting

Tighter per-route caps on expensive endpoints (e.g. `POST /pulls/:id/review`)
live in the route's `config.rateLimit`. The global 120/min cap is in
`src/app.ts`; SSE and `/health*` are exempt.

## See also

- `specs/contracts.md` — Zod contract index (look here before creating a new one)
- `specs/db-schema.md` — schema and migration discipline
- `CLAUDE.md` — broader conventions
