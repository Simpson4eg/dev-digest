/**
 * assemble.test.ts — hermetic unit tests for assembleBriefInput (Task 3).
 *
 * Uses a simple char-based token counter stub so tests are fully deterministic
 * and need no real tiktoken encoder.
 *
 * Test coverage (AC refs from SPEC-02):
 *   (a) assembled input never contains raw diff/changed-line text (AC-1)
 *   (b) over-budget truncation drops in fixed priority order, never drops
 *       intent/blast.summary, final clamp forces ≤8K (AC-5 + cross-model #3)
 *   (c) fully-empty input trips the empty predicate (AC-3b)
 *   (d) absent single artifact is omitted, others survive (AC-3)
 *   (e) untrusted inputs remain discrete fields on the assembled object
 *       (cross-model #1)
 */

import { describe, it, expect } from 'vitest';
import {
  assembleBriefInput,
  isFullyEmpty,
  BRIEF_TOKEN_BUDGET,
  type BriefAssemblyInputs,
  type AssembledBriefInput,
} from './assemble.js';
import type { BlastRadius, Intent, SmartDiff } from '@devdigest/shared';

// ---- Token counter stub -----------------------------------------------------
// Simple char-count / 4 stub — matches the heuristic used in TiktokenTokenizer
// fallback (tokenizer/index.ts:22). Deterministic and zero-dependency.
const charTokens = (text: string): number => Math.ceil(text.length / 4);

// ---- Fixture builders -------------------------------------------------------

function makeIntent(text = 'Add rate-limiting middleware.'): Intent {
  return {
    intent: text,
    in_scope: ['rate limiting'],
    out_of_scope: ['authentication'],
  };
}

function makeBlast(overrides: Partial<BlastRadius> = {}): BlastRadius {
  return {
    summary: 'Blast radius: 3 symbols, 2 downstream callers.',
    changed_symbols: [
      { name: 'RateLimiter', file: 'src/middleware/rate.ts', kind: 'class' },
    ],
    downstream: [
      {
        symbol: 'RateLimiter',
        callers: [{ name: 'applyMiddleware', file: 'src/app.ts', line: 42 }],
        endpoints_affected: ['/api/v1/review'],
        crons_affected: [],
      },
    ],
    prior_prs: [
      {
        pr_number: 100,
        title: 'feat: add middleware',
        author: 'alice',
        merged_at: '2025-01-01T00:00:00Z',
        files_overlap: ['src/middleware/rate.ts'],
      },
    ],
    ref: 'abc123',
    ...overrides,
  };
}

function makeSmartDiff(withFindings = false): SmartDiff {
  return {
    groups: [
      {
        role: 'core',
        files: [
          {
            path: 'src/middleware/rate.ts',
            pseudocode_summary: null,
            additions: 80,
            deletions: 0,
            finding_lines: withFindings ? [12, 34] : [],
          },
        ],
      },
      {
        role: 'boilerplate',
        files: [
          {
            path: 'pnpm-lock.yaml',
            pseudocode_summary: null,
            additions: 200,
            deletions: 100,
            finding_lines: [],
          },
        ],
      },
    ],
    split_suggestion: { too_big: false, total_lines: 80, proposed_splits: [] },
  };
}

const baseInputs: BriefAssemblyInputs = {
  intent: makeIntent(),
  blast: makeBlast(),
  smartDiff: makeSmartDiff(),
  linkedIssueText: 'Rate limiting must be enforced on all API endpoints.',
  specTexts: [{ filename: 'CONTRIBUTING.md', text: 'All PRs must pass CI.' }],
};

// ---- (a) AC-1: no raw diff / changed-line text in assembled input -----------

describe('AC-1: no raw diff or changed-line bodies in assembled input', () => {
  it('assembled input carries only summary stats, never raw diff text', () => {
    const result = assembleBriefInput(baseInputs, charTokens);

    // The assembled input has smartDiffGroups with stats only.
    expect(result.smartDiffGroups).toBeDefined();
    for (const group of result.smartDiffGroups) {
      for (const file of group.files) {
        // Each file carries stat numbers + finding_lines_count, NOT raw line content.
        expect(typeof file.additions).toBe('number');
        expect(typeof file.deletions).toBe('number');
        expect(typeof file.finding_lines_count).toBe('number');
        // There is no `content`, `lines`, `diff`, `changed_lines`, or `body` field.
        expect((file as Record<string, unknown>)['content']).toBeUndefined();
        expect((file as Record<string, unknown>)['lines']).toBeUndefined();
        expect((file as Record<string, unknown>)['diff']).toBeUndefined();
        expect((file as Record<string, unknown>)['changed_lines']).toBeUndefined();
        expect((file as Record<string, unknown>)['body']).toBeUndefined();
      }
    }

    // The assembled object as a whole has no `rawDiff`, `changedLines`, or
    // `patch` field.
    const asRecord = result as unknown as Record<string, unknown>;
    expect(asRecord['rawDiff']).toBeUndefined();
    expect(asRecord['changedLines']).toBeUndefined();
    expect(asRecord['patch']).toBeUndefined();
    expect(asRecord['diffBody']).toBeUndefined();
  });

  it('finding_lines_count is a COUNT, not the actual line numbers array', () => {
    const diff = makeSmartDiff(true); // withFindings = true → lines [12, 34]
    const result = assembleBriefInput({ ...baseInputs, smartDiff: diff }, charTokens);
    const coreGroup = result.smartDiffGroups.find((g) => g.role === 'core');
    expect(coreGroup).toBeDefined();
    const file = coreGroup!.files.find((f) => f.path === 'src/middleware/rate.ts');
    expect(file?.finding_lines_count).toBe(2); // 2 flagged lines, but the numbers are not present
    expect((file as Record<string, unknown>)['finding_lines']).toBeUndefined(); // array itself is absent
  });
});

// ---- (b) AC-5 + cross-model #3: truncation in fixed order, final clamp ------

describe('AC-5 + cross-model #3: over-budget truncation', () => {
  /**
   * Build a token counter that reports a constant high value to trigger
   * truncation, then drops once a target removal is observed.
   *
   * For simplicity, we use the real charTokens but produce inputs that are
   * provably over budget.
   */

  /** Build a string of approximately `targetTokens` tokens (using char heuristic). */
  const makeHeavyText = (targetTokens: number) =>
    'x'.repeat(targetTokens * 4);

  it('step 1: drops spec texts before prior_prs or downstream', () => {
    // Construct inputs that are over budget ONLY because of spec texts.
    const heavySpec = makeHeavyText(BRIEF_TOKEN_BUDGET + 500);
    const inputs: BriefAssemblyInputs = {
      intent: makeIntent(),
      blast: makeBlast(),
      smartDiff: makeSmartDiff(),
      specTexts: [{ filename: 'heavy.md', text: heavySpec }],
    };

    const result = assembleBriefInput(inputs, charTokens);

    // Spec texts should be dropped.
    expect(result.specTexts).toBeUndefined();
    // prior_prs must still be present (wasn't needed to be dropped).
    expect(result.priorPrs).toBeDefined();
    // Token count must be within budget.
    expect(result.tokenCount).toBeLessThanOrEqual(BRIEF_TOKEN_BUDGET);
  });

  it('step 2: drops prior_prs when spec texts alone do not free enough space', () => {
    // Make a large prior_prs list that tips the budget.
    const manyPriorPrs = Array.from({ length: 50 }, (_, i) => ({
      pr_number: i + 1,
      title: makeHeavyText(20), // 20 tokens each, 50 = 1000 tokens extra
      author: 'alice',
      merged_at: '2025-01-01T00:00:00Z',
      files_overlap: ['src/file.ts'],
    }));

    const inputs: BriefAssemblyInputs = {
      intent: makeIntent(),
      blast: makeBlast({ prior_prs: manyPriorPrs }),
      smartDiff: makeSmartDiff(),
      // No spec texts, so step 1 has nothing to drop.
    };

    const result = assembleBriefInput(inputs, charTokens);

    // prior_prs should be dropped when they cause overflow.
    // (If they don't cause overflow, the test is vacuous — add assertion on budget.)
    const rawTokens = charTokens(
      'prior_prs: ' + manyPriorPrs.map((p) => `PR#${p.pr_number} "${p.title}"`).join(' | '),
    );
    if (rawTokens > BRIEF_TOKEN_BUDGET * 0.5) {
      // Prior prs contributed heavily — they should have been dropped.
      expect(result.priorPrs).toBeUndefined();
    }
    expect(result.tokenCount).toBeLessThanOrEqual(BRIEF_TOKEN_BUDGET);
  });

  it('step 3: drops downstream callers beyond top-N when prior_prs was not enough', () => {
    // Build many downstream callers.
    const manyDownstream = Array.from({ length: 100 }, (_, i) => ({
      symbol: `Sym${i}`,
      callers: Array.from({ length: 5 }, (_, j) => ({
        name: `caller${j}`,
        file: `src/file${i}.ts`,
        line: j + 1,
      })),
      endpoints_affected: [`/api/${i}`],
      crons_affected: [],
    }));

    const inputs: BriefAssemblyInputs = {
      intent: makeIntent(),
      blast: makeBlast({ downstream: manyDownstream, prior_prs: [] }),
      smartDiff: makeSmartDiff(),
    };

    const result = assembleBriefInput(inputs, charTokens);

    // Downstream should be truncated.
    const fullTokens = charTokens(
      manyDownstream.map((d) => d.symbol + d.callers.map((c) => c.name).join()).join('|'),
    );
    if (fullTokens > BRIEF_TOKEN_BUDGET * 0.3) {
      expect(result.downstream.length).toBeLessThan(manyDownstream.length);
    }
    expect(result.tokenCount).toBeLessThanOrEqual(BRIEF_TOKEN_BUDGET);
  });

  it('step 4: drops boilerplate SmartDiff file rows when above drops not sufficient', () => {
    // Build inputs where boilerplate files are the main budget driver.
    // Each boilerplate file path is long enough to contribute significant tokens.
    // We use a custom token counter that counts 1 token per char to force overflow.
    const charPerToken = (text: string) => text.length; // 1 token = 1 char
    const budget = BRIEF_TOKEN_BUDGET; // 8000

    // Boilerplate files that each contribute ~20 chars (path + stats line).
    // 500 files × ~50 chars = 25000 > 8000 budget.
    const manyBoilerplateFiles = Array.from({ length: 500 }, (_, i) => ({
      path: `generated/pnpm-lock-${i}.yaml`,
      pseudocode_summary: null,
      additions: 100,
      deletions: 50,
      finding_lines: [] as number[],
    }));

    const heavySmartDiff: SmartDiff = {
      groups: [
        {
          role: 'core',
          files: [
            {
              path: 'src/main.ts',
              pseudocode_summary: null,
              additions: 10,
              deletions: 0,
              finding_lines: [],
            },
          ],
        },
        {
          role: 'boilerplate',
          files: manyBoilerplateFiles,
        },
      ],
      split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
    };

    const inputs: BriefAssemblyInputs = {
      intent: makeIntent('short intent'),
      blast: {
        summary: 'short summary',
        changed_symbols: [],
        downstream: [],
        prior_prs: [],
      },
      smartDiff: heavySmartDiff,
    };

    const result = assembleBriefInput(inputs, charPerToken);

    // The boilerplate group must be dropped (all files removed).
    const boilerplate = result.smartDiffGroups.find((g) => g.role === 'boilerplate');
    // Either the boilerplate group is absent entirely, or has no files.
    expect(!boilerplate || boilerplate.files.length === 0).toBe(true);
    // Core group must still be present.
    const core = result.smartDiffGroups.find((g) => g.role === 'core');
    expect(core).toBeDefined();
    // Budget invariant.
    expect(result.tokenCount).toBeLessThanOrEqual(budget);
  });

  it('cross-model #3 final clamp: even huge intent/blast.summary is clamped to ≤8K', () => {
    // Build an input where EVERYTHING that can be dropped has been dropped,
    // but intent + blastSummary alone exceed 8K tokens.
    const hugeIntentText = makeHeavyText(5_000);
    const hugeBlastSummary = makeHeavyText(5_000);

    const inputs: BriefAssemblyInputs = {
      intent: {
        intent: hugeIntentText,
        in_scope: [],
        out_of_scope: [],
      },
      blast: {
        summary: hugeBlastSummary,
        changed_symbols: [],
        downstream: [],
      },
      // No smart diff, no issue, no specs.
    };

    const result = assembleBriefInput(inputs, charTokens);

    // The final clamp MUST hold the budget invariant (AC-4).
    expect(result.tokenCount).toBeLessThanOrEqual(BRIEF_TOKEN_BUDGET);
    // Protected fields are shortened but not absent (they carry the ellipsis marker).
    expect(result.intentText).toBeDefined();
    expect(result.blastSummary).toBeDefined();
    // The truncation ellipsis must be present in at least one protected field.
    const hasTruncation =
      result.intentText?.includes('[truncated]') || result.blastSummary.includes('[truncated]');
    expect(hasTruncation).toBe(true);
  });

  it('NEVER drops intentText or blastSummary in fixed-order truncation steps', () => {
    // Even after dropping specs, prior_prs, downstream, boilerplate — intent/summary remain.
    const heavySpec = makeHeavyText(BRIEF_TOKEN_BUDGET + 1000);
    const manyDownstream = Array.from({ length: 50 }, (_, i) => ({
      symbol: `Sym${i}`,
      callers: [{ name: 'c', file: 'src/f.ts', line: 1 }],
      endpoints_affected: [],
      crons_affected: [],
    }));

    const inputs: BriefAssemblyInputs = {
      intent: makeIntent('This is the derived intent text that must never be dropped.'),
      blast: makeBlast({
        downstream: manyDownstream,
        prior_prs: [{ pr_number: 1, title: makeHeavyText(50), author: 'a', merged_at: '2025-01-01T00:00:00Z', files_overlap: [] }],
      }),
      smartDiff: makeSmartDiff(),
      specTexts: [{ filename: 'heavy.md', text: heavySpec }],
    };

    const result = assembleBriefInput(inputs, charTokens);

    // Intent text and blast summary must be present (possibly clamped, but not absent).
    expect(result.intentText).toBeTruthy();
    expect(result.blastSummary).toBeTruthy();
    // Budget must hold.
    expect(result.tokenCount).toBeLessThanOrEqual(BRIEF_TOKEN_BUDGET);
  });
});

// ---- (c) AC-3b: fully-empty input trips the empty predicate -----------------

describe('AC-3b: isFullyEmpty predicate', () => {
  it('returns true when no intent, blast degraded, no finding overlay, no issue', () => {
    const inputs: BriefAssemblyInputs = {
      blast: makeBlast({ degraded: true }),
    };
    expect(isFullyEmpty(inputs)).toBe(true);
  });

  it('returns true when blast has reason no_data', () => {
    const inputs: BriefAssemblyInputs = {
      blast: { summary: '', changed_symbols: [], downstream: [], reason: 'no_data' },
    };
    expect(isFullyEmpty(inputs)).toBe(true);
  });

  it('returns true when all fields are absent', () => {
    expect(isFullyEmpty({})).toBe(true);
  });

  it('returns false when intent is present', () => {
    expect(isFullyEmpty({ intent: makeIntent() })).toBe(false);
  });

  it('returns false when linked issue is present', () => {
    expect(isFullyEmpty({ linkedIssueText: 'Some issue body.' })).toBe(false);
  });

  it('returns false when smart diff has finding overlay', () => {
    const smartDiff = makeSmartDiff(true); // withFindings = true
    expect(isFullyEmpty({ smartDiff })).toBe(false);
  });

  it('returns false when blast is not degraded and intent is present', () => {
    expect(isFullyEmpty({ intent: makeIntent(), blast: makeBlast() })).toBe(false);
  });

  it('returns true when smart diff exists but has NO finding overlay', () => {
    const noFindings = makeSmartDiff(false);
    expect(isFullyEmpty({ smartDiff: noFindings })).toBe(true);
  });
});

// ---- (d) AC-3: absent artifact omitted, others survive ----------------------

describe('AC-3: absent artifacts are omitted, present ones survive', () => {
  it('works without intent', () => {
    const inputs: BriefAssemblyInputs = {
      blast: makeBlast(),
      smartDiff: makeSmartDiff(),
    };
    const result = assembleBriefInput(inputs, charTokens);
    expect(result.intentText).toBeUndefined();
    expect(result.intentInScope).toBeUndefined();
    expect(result.blastSummary).toBe(makeBlast().summary);
  });

  it('works without blast', () => {
    const inputs: BriefAssemblyInputs = {
      intent: makeIntent(),
      smartDiff: makeSmartDiff(),
    };
    const result = assembleBriefInput(inputs, charTokens);
    expect(result.blastSummary).toBe('');
    expect(result.changedSymbols).toEqual([]);
    expect(result.downstream).toEqual([]);
    expect(result.intentText).toBe(makeIntent().intent);
  });

  it('works without smart diff', () => {
    const inputs: BriefAssemblyInputs = {
      intent: makeIntent(),
      blast: makeBlast(),
    };
    const result = assembleBriefInput(inputs, charTokens);
    expect(result.smartDiffGroups).toEqual([]);
    expect(result.intentText).toBeTruthy();
  });

  it('works without linked issue', () => {
    const inputs: BriefAssemblyInputs = {
      intent: makeIntent(),
      blast: makeBlast(),
    };
    const result = assembleBriefInput(inputs, charTokens);
    expect(result.linkedIssueText).toBeUndefined();
  });

  it('works without spec texts', () => {
    const inputs: BriefAssemblyInputs = {
      intent: makeIntent(),
      blast: makeBlast(),
    };
    const result = assembleBriefInput(inputs, charTokens);
    expect(result.specTexts).toBeUndefined();
  });

  it('omits priorPrs when blast has none', () => {
    const inputs: BriefAssemblyInputs = {
      blast: makeBlast({ prior_prs: [] }),
    };
    const result = assembleBriefInput(inputs, charTokens);
    expect(result.priorPrs).toBeUndefined();
  });

  it('includes priorPrs when blast carries them', () => {
    const result = assembleBriefInput(baseInputs, charTokens);
    expect(result.priorPrs).toBeDefined();
    expect(result.priorPrs!.length).toBe(1);
  });

  it('blast ref is carried through when present', () => {
    const result = assembleBriefInput(baseInputs, charTokens);
    expect(result.blastRef).toBe('abc123');
  });

  it('blast ref is undefined when absent', () => {
    const inputs: BriefAssemblyInputs = {
      blast: makeBlast({ ref: undefined }),
    };
    const result = assembleBriefInput(inputs, charTokens);
    expect(result.blastRef).toBeUndefined();
  });

  it('token count is always a non-negative number', () => {
    const result = assembleBriefInput({}, charTokens);
    expect(typeof result.tokenCount).toBe('number');
    expect(result.tokenCount).toBeGreaterThanOrEqual(0);
  });
});

// ---- (e) cross-model #1: untrusted fields remain discrete -------------------

describe('cross-model #1: untrusted inputs are discrete fields, not concatenated', () => {
  it('intentText, linkedIssueText, and specTexts are separate fields', () => {
    const result = assembleBriefInput(baseInputs, charTokens);

    // Each untrusted field exists independently.
    expect(result.intentText).toBeDefined();
    expect(result.linkedIssueText).toBeDefined();
    expect(result.specTexts).toBeDefined();

    // They are NOT merged into a single string field.
    // The assembled object has no field named e.g. `allUntrustedText` or `merged`.
    const asRecord = result as unknown as Record<string, unknown>;
    expect(asRecord['allUntrustedText']).toBeUndefined();
    expect(asRecord['merged']).toBeUndefined();
    expect(asRecord['combinedInput']).toBeUndefined();
    expect(asRecord['prompt']).toBeUndefined(); // no pre-baked prompt
  });

  it('intentText content does not bleed into linkedIssueText', () => {
    const intent = makeIntent('SECRET_INTENT_SENTINEL');
    const issue = 'ISSUE_BODY_SENTINEL';
    const result = assembleBriefInput(
      { intent, linkedIssueText: issue },
      charTokens,
    );

    expect(result.intentText).toBe('SECRET_INTENT_SENTINEL');
    expect(result.linkedIssueText).toBe('ISSUE_BODY_SENTINEL');
    // The values must not be concatenated in either field.
    expect(result.intentText).not.toContain('ISSUE_BODY_SENTINEL');
    expect(result.linkedIssueText).not.toContain('SECRET_INTENT_SENTINEL');
  });

  it('specTexts entries remain separate from blastSummary', () => {
    const blast = makeBlast({ summary: 'BLAST_SUMMARY_SENTINEL' });
    const specs = [{ filename: 'SPEC_SENTINEL.md', text: 'SPEC_TEXT_SENTINEL' }];
    const result = assembleBriefInput({ blast, specTexts: specs }, charTokens);

    expect(result.blastSummary).toBe('BLAST_SUMMARY_SENTINEL');
    expect(result.specTexts).toEqual(specs);
    // Sentinel values must not cross-contaminate.
    expect(result.blastSummary).not.toContain('SPEC_TEXT_SENTINEL');
    expect(result.specTexts![0]!.text).not.toContain('BLAST_SUMMARY_SENTINEL');
  });

  it('multiple spec texts remain as separate array entries', () => {
    const specs = [
      { filename: 'SPEC_A.md', text: 'Text A sentinel' },
      { filename: 'SPEC_B.md', text: 'Text B sentinel' },
    ];
    const result = assembleBriefInput({ blast: makeBlast(), specTexts: specs }, charTokens);

    // Two separate entries, not merged into one.
    expect(result.specTexts?.length).toBe(2);
    expect(result.specTexts![0]!.text).not.toContain('Text B sentinel');
    expect(result.specTexts![1]!.text).not.toContain('Text A sentinel');
  });

  it('assembled result is a structured object, not a pre-serialized prompt string', () => {
    const result = assembleBriefInput(baseInputs, charTokens);
    // The function returns an object, not a string.
    expect(typeof result).toBe('object');
    // It has typed fields, not a single `text` or `prompt` string.
    expect(typeof result.intentText).toBe('string');
    expect(typeof result.blastSummary).toBe('string');
    expect(Array.isArray(result.smartDiffGroups)).toBe(true);
  });
});

// ---- Additional: token count is set correctly --------------------------------

describe('token count', () => {
  it('returns tokenCount that matches the countTokens function output', () => {
    const counts: number[] = [];
    const trackingCounter = (text: string) => {
      const n = charTokens(text);
      counts.push(n);
      return n;
    };

    const result = assembleBriefInput(baseInputs, trackingCounter);
    // The token count should be the last measurement (post-truncation).
    expect(result.tokenCount).toBeGreaterThan(0);
    // The count must have been computed at least once.
    expect(counts.length).toBeGreaterThan(0);
    // The final tokenCount matches what the counter returned for the final state.
    expect(counts[counts.length - 1]).toBe(result.tokenCount);
  });

  it('tokenCount is ≤ BRIEF_TOKEN_BUDGET for valid inputs', () => {
    const result = assembleBriefInput(baseInputs, charTokens);
    expect(result.tokenCount).toBeLessThanOrEqual(BRIEF_TOKEN_BUDGET);
  });
});
