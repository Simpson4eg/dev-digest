// One-off: cross-model review of an Implementation Plan via OpenRouter.
// Sends the approved spec + plan to a DIFFERENT-family model acting as a staff
// engineer, with no access to the authoring chat. Prints the critique to stdout.
import { readFileSync } from 'node:fs';

function loadKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const env = readFileSync(new URL('../server/.env', import.meta.url), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*OPENROUTER_API_KEY\s*=\s*(.+?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  throw new Error('OPENROUTER_API_KEY not found in env or server/.env');
}

const model = process.argv[2] || 'openai/gpt-4o';
const spec = readFileSync(new URL('../specs/SPEC-02-why-risk-brief.md', import.meta.url), 'utf8');
const plan = readFileSync(new URL('../plans/PLAN-02-why-risk-brief.md', import.meta.url), 'utf8');

const system = `You are a staff software engineer doing an INDEPENDENT review of an implementation plan.
You have NO access to the author's chat, reasoning, or the codebase — only the spec and the plan text below.
The project ("DevDigest") is a local-first AI PR-review tool: a Fastify 5 + Drizzle/Postgres server, a pure
TypeScript review engine ("reviewer-core", no DB/fs/network except an injected LLM provider), and a Next.js 15
client. Contracts are Zod, source-of-truth in server/src/vendor/shared and copied to the client.

Review the PLAN against the SPEC as a skeptical staff engineer. Be concrete and terse. Focus on, in priority order:
1. Coverage gaps: any acceptance criterion (AC) the plan does not actually satisfy, or satisfies only nominally.
2. Risky or wrong assumptions (e.g. purity boundary, tenant scoping, the in-process in-flight lock, the token-budget/truncation logic, grounding correctness).
3. Ordering / dependency errors in the task graph, or files two parallel tasks would both write.
4. Security / injection / untrusted-input handling holes.
5. Over-engineering or under-engineering relative to what the spec actually requires.
6. Anything that will bite during implementation that the plan glosses over.

Output as a numbered list of concrete findings, each tagged [BLOCKER] / [SHOULD-FIX] / [NIT], each 1-3 sentences.
End with a one-line overall verdict. Do not restate the plan back; only critique.`;

const body = {
  model,
  temperature: 0.3,
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: `# SPEC\n\n${spec}\n\n---\n\n# PLAN\n\n${plan}` },
  ],
};

const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${loadKey()}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
if (!res.ok) {
  console.error(`OpenRouter HTTP ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const json = await res.json();
const choice = json.choices?.[0]?.message?.content;
if (!choice) {
  console.error(`No choices: ${JSON.stringify(json).slice(0, 500)}`);
  process.exit(1);
}
const u = json.usage || {};
console.error(`[model=${json.model || model} tokens_in=${u.prompt_tokens ?? '?'} tokens_out=${u.completion_tokens ?? '?'}]`);
console.log(choice);
