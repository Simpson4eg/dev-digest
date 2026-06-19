# `LLMProvider` interface

The single port the engine depends on. Everything else (DB, GitHub, fs) is the
consumer's problem.

## Shape

```ts
interface LLMProvider {
  complete(input: {
    model: string;
    systemPrompt: string;
    userMessage: string;
    responseSchema?: JsonSchema;   // derived from Zod via toJsonSchema()
    maxTokens?: number;
    temperature?: number;
  }): Promise<{
    text: string;                  // raw model output (may be chatty JSON)
    usage?: { promptTokens: number; completionTokens: number; };
  }>;
}
```

The engine never assumes structured output is guaranteed — `parseWithRepair`
extracts the JSON from `text` and retries once on shape mismatch.

## Implementations

| Impl                          | Where                                          | Use                          |
|-------------------------------|------------------------------------------------|------------------------------|
| OpenRouter                    | `src/llm/openrouter.ts` (this package)         | default in the server        |
| Server-side direct providers  | `server/src/adapters/llm/`                     | OpenAI, Anthropic, Azure     |
| Mock                          | `server/src/adapters/mocks.ts`                 | hermetic tests               |

## Contract rules

- **Deterministic mocking.** The mock provider receives the same input every
  test run for a given seed. Tests rely on this.
- **No retries inside the provider.** The engine handles the one repair retry
  via `parseWithRepair`. If a provider adds its own retries, it must not
  exceed a single pass.
- **No prompt mutation.** The provider sends `systemPrompt` + `userMessage`
  verbatim. Provider-specific wrappers (e.g. Anthropic's `system` field) are
  fine; rewording is not.
- **Tokens reported when known.** `usage` is optional but populated when the
  upstream API returns it — used for cost reporting per
  `docs/agent-prompts/choosing-a-model.md`.

## Wiring in consumers

Consumers construct the impl with their config (API key from
`SecretsProvider`, model from the agent record) and pass it into `run` /
`reduce`. The engine never constructs its own provider.

## See also

- `docs/pipeline.md` — where `LLMProvider.complete` is called
- `../server/docs/adapters.md` — how providers are wired in the server
