# Database schema

PostgreSQL with the **pgvector** extension. Drizzle ORM is the source of truth;
SQL migrations are generated from the TypeScript schema files.

## Layout

```
src/db/
  schema.ts         ← barrel re-export — import from here
  schema/           ← domain files (core, repos, pulls, reviews, agents, …)
  migrations/       ← GENERATED — do not hand-edit
  migrations/meta/  ← Drizzle Kit bookkeeping
  migrate.ts        ← runs pending migrations (`pnpm db:migrate`)
  seed.ts           ← idempotent demo data (`pnpm db:seed`)
  client.ts         ← postgres-js Drizzle client factory
```

## Domain files in `schema/`

`core` · `repos` · `pulls` · `reviews` · `skills` · `agents` · `knowledge` ·
`context` · `eval` · `ci` · `runs` · `ops` · `repo-intel`.

Every starter domain table exists in the schema even when no starter feature
populates it — later course lessons fill the unused ones.

## Invariants

- **`workspace_id`** on every tenant-scoped table. Repositories filter by it on
  every read. Joins that cross workspaces are a bug.
- **`created_by`** where the record is user-owned (agents, reviews, settings).
- **Soft delete** is not used — deletes cascade where they make sense, otherwise
  records are immutable history (runs, traces).
- **pgvector** columns (`vector(N)`) live in `memory` and `repo-intel.embeddings`.
  Enabled by migration `0000`.

## Migration discipline

1. Edit a file under `src/db/schema/`.
2. `pnpm db:generate` — Drizzle Kit emits the next migration into
   `src/db/migrations/`.
3. Review the generated SQL. Don't hand-edit it; if it's wrong, fix the schema
   file and regenerate.
4. `pnpm db:migrate` to apply locally. CI applies on every deploy.
5. Migrations are **never** applied on boot — keep dev parity with CI.

## Drizzle conventions

- Tables defined with `pgTable`. PKs are `uuid().primaryKey().defaultRandom()`
  unless the domain needs a deterministic id.
- Timestamps as `timestamp({ withTimezone: true }).defaultNow()`.
- Foreign keys use `references(() => other.id, { onDelete: 'cascade' })` where a
  child genuinely cannot outlive its parent.
- Indexes declared inline on the table for any column used in a WHERE.

## See also

- `CLAUDE.md` — do-not-touch notes on `migrations/`
- `docs/adding-a-module.md` — where the repository layer plugs in
