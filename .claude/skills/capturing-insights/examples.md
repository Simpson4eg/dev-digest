# examples — bad vs good INSIGHTS entries

The quality bar: actionable "cold". A reader knows what to do without asking.

If you can't tell whether your entry passes, compare it to these pairs.

## Async / concurrency

❌ `Promises can be tricky` — pure noise, not a lesson.
❌ `обережно з async` — same, no actionable content.

✅ `Promise.all() on the ingest pipeline times out past 30 elements — use
Promise.allSettled() with batches of 10. Evidence:
src/modules/repo-intel/ingest.ts:84`

Why the good one works: names the exact pipeline, the threshold, the fix, and
where it lives. A future agent doesn't have to re-discover anything.

## State management

❌ `careful with state` — restates a truism.

✅ `Cart state must go through Zustand (cartStore.ts) — three components share
the cart, so component-local state silently desyncs. Evidence:
src/lib/cartStore.ts:1`

Why: explains the *constraint* (three consumers), not just the *rule*.

## Drizzle / Postgres (this repo)

❌ `use Drizzle for queries` — already a project convention; in CLAUDE.md.

✅ `Drizzle's .returning() on a pgvector column ships the vector to the client
as a JSON array of ~1500 floats — explicitly select only the columns you need
when the row contains embeddings. Evidence:
src/modules/repo-intel/repository.ts:142`

Why: documents a non-obvious cost no one notices until queries get slow.

## Fastify

❌ `validate inputs` — restates the framework rule.

✅ `fastify-type-provider-zod's response serializer strips unknown keys
silently — if a Zod schema's optional field is misnamed, the value disappears
from the response with no error. Always run pnpm typecheck after touching a
response schema. Evidence: src/modules/reviews/routes.ts:31`

Why: names the silent failure mode and the cheap detection.

## TanStack Query

❌ `invalidate after mutations` — generic.

✅ `useReviews query key must include the PR id; broad invalidation
(['reviews']) refetches every PR's reviews on a single accept-finding mutation
and pegs the API at ~3s per page. Use ['reviews', { prId }] and invalidate
narrowly. Evidence: src/lib/hooks/useReviews.ts:18`

Why: ties the key shape to a measured cost.

## reviewer-core

❌ `LLMs hallucinate` — truism.

✅ `groundFindings() drops findings citing removed (-) lines because the
unified-diff parser only maps + and context line numbers. If a model
consistently flags removed code, the grounding gate looks "too aggressive" —
it's not, the input is wrong. Evidence: reviewer-core/src/grounding.ts:54`

Why: explains an observable behavior whose cause isn't in the function name.

## e2e

❌ `e2e is flaky` — venting, not a lesson.

✅ `Flow 02 depends on the seeded repo being the only one in the DB; it
follows the home redirect to the *first* repo. Running it against the dev DB
after importing other repos lands on the wrong PR list and fails with
"text not found". Use ./scripts/e2e.sh. Evidence: e2e/specs/02-repo-pulls-detail.flow.json:5`

Why: names the precondition that the JSON doesn't reveal.

## The single test

For every candidate entry, ask:

> If the reader could derive this by reading the code I'm citing, why am I
> writing it?

If the answer is "they couldn't — the constraint / cost / surprise lives
outside the code", write it. Otherwise drop it.
