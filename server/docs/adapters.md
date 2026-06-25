# Adding an adapter

External IO sits behind interfaces in `src/adapters/<kind>/`. Services depend on
the interface, not the implementation, so tests swap in mocks from
`src/adapters/mocks.ts`.

## Existing adapters

| Kind         | Purpose                                            |
|--------------|----------------------------------------------------|
| `llm/`       | LLM provider (OpenAI / Anthropic / OpenRouter)     |
| `github/`    | GitHub API (octokit)                               |
| `git/`       | local git operations (`simple-git`)                |
| `astgrep/`   | structural code search (`@ast-grep/napi`)          |
| `tokenizer/` | token counting (`js-tiktoken`)                     |
| `secrets/`   | secret read chokepoint (`LocalSecretsProvider`)    |
| `codeindex/` | ripgrep-based code index (`@vscode/ripgrep`)       |
| `depgraph/`  | dependency graph (`dependency-cruiser` + graphology)|
| `embedder/`  | embeddings for memory/RAG                          |
| `auth/`      | auth surface (placeholder in starter)              |

## Convention

```
src/adapters/<kind>/
  index.ts          ← interface + factory
  <impl>.ts         ← concrete impl
  *.test.ts         ← contract tests against the interface
```

The interface lives in `index.ts` and is what services consume. The DI container
(`src/platform/container.ts`) is the only place that knows which impl to wire.

## Steps

1. Define the interface in `index.ts`. Keep it narrow — only the methods the
   service actually needs.
2. Implement against the third-party SDK in a separate file.
3. Add a mock in `src/adapters/mocks.ts`. Hermetic tests use this; integration
   tests may use the real impl when the dependency is cheap (e.g. local git).
4. Register in `src/platform/container.ts` — read config / secrets there, not in
   the adapter itself.

## Secrets

If your adapter needs a key, take it as a constructor argument; do **not** read
`process.env` or `~/.devdigest/secrets.json` inside the adapter. The container
calls `SecretsProvider.get('SERVICE_API_KEY')` and passes the resolved value in.
This keeps the secret read chokepoint at `src/adapters/secrets/local.ts`.

## See also

- `CLAUDE.md` — DI conventions
- `docs/setup.md` — secret layout
