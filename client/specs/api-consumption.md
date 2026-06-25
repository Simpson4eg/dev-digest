# API consumption

The client consumes the Fastify API exclusively through `src/lib/api.ts`. Every
request goes out with a Zod contract attached; responses are parsed against the
contract before reaching components.

## Contract source

Schemas are imported from `src/vendor/shared/contracts/` — a **read-only**
vendored copy of `server/src/vendor/shared/contracts/`. Edit the server-side
originals; the vendor sync propagates them here.

The contract files mirror the server's domain split (`review-api.ts`,
`findings.ts`, `platform.ts`, …). Refer to
[`../../server/specs/contracts.md`](../../server/specs/contracts.md) for what
each file covers.

## Calling pattern

```ts
import { RepoListResponse } from '@/vendor/shared/contracts/platform';
import { api } from '@/lib/api';

const repos = await api.get('/repos', RepoListResponse);
// `repos` is typed as z.infer<typeof RepoListResponse>
```

`api.get` / `api.post` / `api.put` / `api.delete`:

1. Prefix with `NEXT_PUBLIC_API_BASE`.
2. Serialize body with `JSON.stringify`.
3. Throw on non-2xx with a typed error envelope.
4. Parse the response with the provided Zod schema (`schema.parse` → throws on
   shape mismatch).

## Error envelope

The server emits a structured error body for non-2xx; the client surfaces it as
a typed error. Validation errors (422) carry per-field details; component-level
forms can map them back to fields.

## SSE

`EventSource` is created directly against `NEXT_PUBLIC_API_BASE` for run-trace
streams. The `lib/api.ts` wrapper does not handle SSE — see the hook that
subscribes.

## Don't

- **Don't** call `fetch` directly inside components. Always go through
  `lib/api.ts` so Zod parsing happens.
- **Don't** weaken a Zod schema in the client copy to "make it compile". Fix
  the server-side schema; the copy follows.

## See also

- `../server/specs/contracts.md` — full contract index
- `docs/state-management.md` — how hooks layer on top of `api.ts`
