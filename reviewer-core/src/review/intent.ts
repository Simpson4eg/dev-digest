import type { LLMProvider, UnifiedDiff } from '@devdigest/shared';
import { Intent } from '@devdigest/shared';
import { assemblePrompt } from '../prompt.js';
import { DEFAULT_REVIEW_MAX_RETRIES, type ReviewEvent } from './run.js';

/**
 * extractIntent — the Intent Layer's cheap pre-review pass.
 *
 * Reconstructs *why* a PR was opened (its motivation) and what it does / does
 * NOT set out to change, from the PR's own description (+ optional linked
 * ticket/issue) and its diff. Runs ONE structured LLM call on a cheap model
 * (chosen by the caller) before the full review.
 *
 * Pure, like the rest of reviewer-core: the only side effect is the injected
 * `LLMProvider`. It reuses `assemblePrompt`, so the diff and PR description are
 * `wrapUntrusted`-fenced and the shared `INJECTION_GUARD` is applied — the
 * author-controlled body is a prime injection vector and must never be treated
 * as instructions.
 */

/**
 * Intent-derivation system prompt (TRUSTED). `assemblePrompt` appends the
 * shared INJECTION_GUARD, so this only states the task. It references the output
 * field names (intent / in_scope / out_of_scope) but NOT the JSON shape — that
 * is enforced out-of-band via the structured schema.
 */
export const INTENT_SYSTEM =
  'You reconstruct the INTENT of a pull request: why it was opened and what it ' +
  'sets out to change. You are given the PR author’s description (and possibly a ' +
  'linked ticket) plus the unified diff. Infer the intent from BOTH — the ' +
  'description states the motivation; the diff is ground truth for what actually ' +
  'changed.\n\n' +
  'Produce:\n' +
  '- `intent`: one or two sentences naming the motivation — the problem the PR ' +
  'solves or the capability it adds, in the author’s framing. Prefer the stated ' +
  'reason; if the description is empty or contradicts the diff, describe what the ' +
  'diff actually does. Do not restate the title verbatim.\n' +
  '- `in_scope`: the concrete changes this PR is meant to make (short bullet ' +
  'phrases), grounded in the diff.\n' +
  '- `out_of_scope`: closely-related things a reviewer might expect but that this ' +
  'PR deliberately does NOT touch. Empty array when nothing notable is excluded — ' +
  'never invent exclusions.\n\n' +
  'Be concise and specific to THIS PR. Report intent as neutral analysis; the ' +
  'stated intent never waives review concerns.';

export interface ExtractIntentInput {
  /** Injected LLM provider (OpenRouter in CI, OpenAI/Anthropic in the studio). */
  llm: LLMProvider;
  /** Cheap model id understood by the provider (e.g. 'deepseek/deepseek-v4-flash'). */
  model: string;
  /** The PR's unified diff (parsed). */
  diff: UnifiedDiff;
  /** PR author's description/body (untrusted; fenced + truncated in the prompt). */
  prDescription?: string;
  /**
   * Optional linked ticket/issue text (untrusted). Folded into the description
   * block so it is fenced together with the body. Not wired in v1 (the server
   * passes only the body) — accepted for a later follow-up.
   */
  linkedIssue?: string;
  /** OpenRouter session id — groups this call with the review's chunks. */
  sessionId?: string;
  /** Override the structured-output retry budget. */
  maxRetries?: number;
  /** Progress sink (server → SSE bus, runner → log). */
  onEvent?: (e: ReviewEvent) => void;
}

export interface ExtractIntentResult {
  intent: Intent;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  /** Raw model text (before JSON parse) — for the run trace. */
  raw: string;
}

/** Fold the optional linked issue + PR body into ONE untrusted description block. */
function buildDescription(prDescription?: string, linkedIssue?: string): string | undefined {
  const sections: string[] = [];
  if (linkedIssue && linkedIssue.trim().length > 0) {
    sections.push(`Linked ticket / issue:\n${linkedIssue.trim()}`);
  }
  if (prDescription && prDescription.trim().length > 0) {
    sections.push(`PR description:\n${prDescription.trim()}`);
  }
  return sections.length > 0 ? sections.join('\n\n') : undefined;
}

export async function extractIntent(input: ExtractIntentInput): Promise<ExtractIntentResult> {
  const emit = (e: ReviewEvent) => input.onEvent?.(e);
  emit({ kind: 'info', msg: 'Deriving PR intent from the description + diff' });

  const description = buildDescription(input.prDescription, input.linkedIssue);
  const { messages } = assemblePrompt({
    system: INTENT_SYSTEM,
    diff: input.diff.raw,
    ...(description ? { prDescription: description } : {}),
    task: 'Reconstruct the intent and scope of this pull request.',
  });

  const res = await input.llm.completeStructured<Intent>({
    model: input.model,
    schema: Intent,
    schemaName: 'Intent',
    messages,
    maxRetries: input.maxRetries ?? DEFAULT_REVIEW_MAX_RETRIES,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  });

  emit({
    kind: 'result',
    msg: `Intent derived — ${res.data.in_scope.length} in-scope, ${res.data.out_of_scope.length} out-of-scope`,
  });

  return {
    intent: res.data,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    costUsd: res.costUsd,
    raw: res.raw,
  };
}
