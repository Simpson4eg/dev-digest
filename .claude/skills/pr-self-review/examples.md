# pr-self-review — examples

## Example A — BLOCK (CRITICAL present)

Changed files on `lab_02`:

```
server/src/adapters/github/client.ts   (backend)
client/src/app/repos/[repoId]/page.tsx (UI)
```

Run `/pr-self-review`:

- Backend group → onion-architecture, fastify-best-practices, security, zod, typescript-expert
- UI group → frontend-architecture, react-/next-best-practices, security, zod, typescript-expert

Finding:

```
CRITICAL (1)
  server/src/adapters/github/client.ts:42  [security/secret_leak]
    Hardcoded GitHub token in source.
    → Read via SecretsProvider (~/.devdigest/secrets.json) with env fallback;
      never commit tokens. (server/AGENTS.md "Secrets")

VERDICT: BLOCK — 1 CRITICAL. PR/push refused. Fix and re-run /pr-self-review.
```

No marker written. A subsequent `git push` hits the hook:

```
permissionDecision: deny — "PR self-review gate: no current PASS for this
state (<sha> <state-hash>). Run /pr-self-review and resolve any CRITICAL findings
before gh pr create / git push."
```

## Example B — PASS (only advisory findings)

After moving the token to `SecretsProvider`, re-run `/pr-self-review`:

```
WARNING (1)
  client/src/app/repos/[repoId]/page.tsx:8  [style]
    'use client' at route top — push the boundary to the interactive leaf.
    (frontend-architecture: server-first placement)

VERDICT: PASS — 0 CRITICAL, 1 WARNING (advisory).
```

Marker written to `.git/pr-self-review-pass` (`<sha> <state-hash>`). `git push` now
passes the hook. WARNING/SUGGESTION are reported but do not block.

## Example C — staleness

After a PASS, you make one more commit. The marker's sha no longer matches HEAD,
so the next `git push` is denied again until you re-run `/pr-self-review`. This
guarantees the review always covers exactly what is about to leave the machine.
