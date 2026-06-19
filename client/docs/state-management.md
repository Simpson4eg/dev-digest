# State management

Server state → **TanStack Query**. Local UI state → React `useState` / context.
We don't use Redux, Zustand, or any global store.

## Hooks layout

One hook per resource in `src/lib/hooks/`. Each hook:

1. Calls `src/lib/api.ts` (which parses with the Zod contract).
2. Wraps the call in `useQuery` / `useMutation`.
3. Returns the query result directly — no extra wrapper layer.

```ts
// src/lib/hooks/useRepos.ts
export function useRepos() {
  return useQuery({
    queryKey: ['repos'],
    queryFn: () => api.get('/repos', RepoListResponse),
  });
}
```

## Keys

- Start with the resource: `['repos']`, `['pulls']`, `['agents']`.
- Include any input that changes the response: `['pulls', { repoId }]`.
- Workspace scoping is implicit (single workspace in the starter); add a
  workspace id to the key the moment multi-workspace lands.

## Mutations + invalidation

On success, invalidate the keys whose data is now stale:

```ts
useMutation({
  mutationFn: (input) => api.post('/repos', input, RepoRecord),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['repos'] }),
});
```

Prefer narrow invalidation (`['pulls', { repoId }]`) over blunt (`['pulls']`)
when you know the exact key.

## SSE (run trace)

Live run traces use `EventSource` against `/runs/:id/events` (server uses
`fastify-sse-v2`). The hook subscribes on mount and feeds events into local
state — they don't go through TanStack Query.

## Anti-patterns

- Don't store server data in `useState` after fetching with TanStack Query — the
  cache IS the store.
- Don't put TanStack Query results into React context — components subscribe
  directly via the hook.
- Don't write a custom fetch wrapper inside a hook — go through `src/lib/api.ts`
  so Zod parsing happens uniformly.

## See also

- `specs/api-consumption.md` — how `lib/api.ts` parses with Zod
- `CLAUDE.md` — hook naming and layout
