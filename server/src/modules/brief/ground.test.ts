/**
 * ground.test.ts — hermetic unit tests for the Brief grounding gate (Task 5).
 *
 * All tests are pure — no DB, no LLM, no fs, no Container.
 *
 * Coverage (AC refs from SPEC-02 / PLAN-02 Task 5):
 *   (a) AC-8: a risk whose EVERY file_ref is absent is dropped;
 *             a risk with at least ONE present ref survives.
 *   (b) AC-9: a focus item outside the evidence is dropped;
 *             one inside survives with its line/symbol INTACT.
 *   (c) all-risks-dropped yields a valid empty-risks result (AC-8 edge case).
 *   (d) AC-10: a survivor that maps to a caller file is flagged isCallerFileRef=true;
 *              a survivor that maps to a changed file only is flagged false.
 *   (e) buildEvidenceSets covers all evidence sources correctly.
 */

import { describe, it, expect } from 'vitest';
import {
  buildEvidenceSets,
  groundBrief,
  groundBriefToPlain,
  type GroundedBriefRisk,
  type GroundedReviewFocus,
} from './ground.js';
import type { BlastRadius, BriefRisk, ReviewFocus, SmartDiff } from '@devdigest/shared';

// ---- Fixture builders -------------------------------------------------------

function makeBlast(overrides: Partial<BlastRadius> = {}): BlastRadius {
  return {
    summary: 'Blast summary.',
    changed_symbols: [
      { name: 'RateLimiter', file: 'src/middleware/rate.ts', kind: 'class' },
    ],
    downstream: [
      {
        symbol: 'RateLimiter',
        callers: [
          { name: 'applyMiddleware', file: 'src/app.ts', line: 42 },
        ],
        endpoints_affected: ['/api/v1/review'],
        crons_affected: ['cron:nightly-cleanup'],
      },
    ],
    ref: 'indexed-sha-abc123',
    ...overrides,
  };
}

function makeSmartDiff(): SmartDiff {
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
            finding_lines: [],
          },
          {
            path: 'src/utils/helpers.ts',
            pseudocode_summary: null,
            additions: 10,
            deletions: 5,
            finding_lines: [],
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
    split_suggestion: { too_big: false, total_lines: 295, proposed_splits: [] },
  };
}

function makeBriefRisk(file_refs: string[], title = 'Test risk'): BriefRisk {
  return {
    title,
    explanation: 'Explanation of the risk.',
    severity: 'high',
    file_refs,
  };
}

function makeReviewFocus(
  file: string,
  line: number | null = 42,
  symbol: string | null = 'RateLimiter',
): ReviewFocus {
  return {
    file,
    line,
    symbol,
    reason: 'Needs careful review.',
  };
}

// ---- (a) AC-8: risk grounding -----------------------------------------------

describe('AC-8: risk grounding — at-least-one-match rule', () => {
  it('drops a risk whose EVERY file_ref is absent from evidence', () => {
    const blast = makeBlast();
    const risk = makeBriefRisk(['src/does-not-exist.ts', 'src/also-gone.ts']);

    const result = groundBrief([risk], [], blast, makeSmartDiff());

    expect(result.groundedRisks).toHaveLength(0);
    expect(result.droppedRisks).toBe(1);
  });

  it('keeps a risk when AT LEAST ONE file_ref is in the evidence set', () => {
    const blast = makeBlast();
    // One absent ref + one present ref in changed_symbols.
    const risk = makeBriefRisk(['src/does-not-exist.ts', 'src/middleware/rate.ts']);

    const result = groundBrief([risk], [], blast, makeSmartDiff());

    expect(result.groundedRisks).toHaveLength(1);
    expect(result.groundedRisks[0]!.risk).toEqual(risk);
    expect(result.droppedRisks).toBe(0);
  });

  it('keeps a risk when ALL file_refs are present in evidence', () => {
    const blast = makeBlast();
    const risk = makeBriefRisk(['src/middleware/rate.ts', 'src/app.ts']);

    const result = groundBrief([risk], [], blast, makeSmartDiff());

    expect(result.groundedRisks).toHaveLength(1);
    expect(result.droppedRisks).toBe(0);
  });

  it('processes multiple risks independently — drops only the ungrounded ones', () => {
    const blast = makeBlast();
    const validRisk = makeBriefRisk(['src/middleware/rate.ts'], 'Valid risk');
    const invalidRisk = makeBriefRisk(['src/hallucinated.ts'], 'Hallucinated risk');
    const alsoValidRisk = makeBriefRisk(['src/app.ts'], 'Caller-file risk');

    const result = groundBrief(
      [validRisk, invalidRisk, alsoValidRisk],
      [],
      blast,
      makeSmartDiff(),
    );

    expect(result.groundedRisks).toHaveLength(2);
    expect(result.droppedRisks).toBe(1);
    expect(result.groundedRisks.map((r) => r.risk.title)).toEqual([
      'Valid risk',
      'Caller-file risk',
    ]);
  });

  it('keeps a risk grounded via endpoint ref from downstream.endpoints_affected', () => {
    const blast = makeBlast();
    // '/api/v1/review' is in blast.downstream[0].endpoints_affected.
    const risk = makeBriefRisk(['/api/v1/review']);

    const result = groundBrief([risk], [], blast, makeSmartDiff());

    expect(result.groundedRisks).toHaveLength(1);
  });

  it('keeps a risk grounded via cron ref from downstream.crons_affected', () => {
    const blast = makeBlast();
    // 'cron:nightly-cleanup' is in blast.downstream[0].crons_affected.
    const risk = makeBriefRisk(['cron:nightly-cleanup']);

    const result = groundBrief([risk], [], blast, makeSmartDiff());

    expect(result.groundedRisks).toHaveLength(1);
  });

  it('keeps a risk grounded via smart-diff file path', () => {
    const smartDiff = makeSmartDiff();
    // 'src/utils/helpers.ts' is in the smart-diff core group only.
    const risk = makeBriefRisk(['src/utils/helpers.ts']);

    // No blast — only smart-diff evidence.
    const result = groundBrief([risk], [], undefined, smartDiff);

    expect(result.groundedRisks).toHaveLength(1);
  });

  it('handles an empty file_refs array by dropping the risk', () => {
    // A risk with no file_refs can never match — it should be dropped.
    const risk = makeBriefRisk([]);
    const result = groundBrief([risk], [], makeBlast(), makeSmartDiff());

    expect(result.groundedRisks).toHaveLength(0);
    expect(result.droppedRisks).toBe(1);
  });
});

// ---- (b) AC-9: review_focus grounding ---------------------------------------

describe('AC-9: review_focus grounding — file presence + line/symbol carry-through', () => {
  it('drops a focus item whose file is absent from evidence', () => {
    const focus = makeReviewFocus('src/does-not-exist.ts');
    const result = groundBrief([], [focus], makeBlast(), makeSmartDiff());

    expect(result.groundedFocus).toHaveLength(0);
    expect(result.droppedFocus).toBe(1);
  });

  it('keeps a focus item whose file is in the evidence set', () => {
    // 'src/middleware/rate.ts' is in both changed_symbols and smart-diff.
    const focus = makeReviewFocus('src/middleware/rate.ts', 55, 'processRequest');
    const result = groundBrief([], [focus], makeBlast(), makeSmartDiff());

    expect(result.groundedFocus).toHaveLength(1);
    expect(result.droppedFocus).toBe(0);
  });

  it('carries line through UNCHANGED when focus survives (D8, AC-9)', () => {
    const focus = makeReviewFocus('src/middleware/rate.ts', 99, null);
    const result = groundBrief([], [focus], makeBlast(), makeSmartDiff());

    const survived = result.groundedFocus[0]!;
    expect(survived.focus.line).toBe(99);
    expect(survived.focus.symbol).toBeNull();
    expect(survived.focus.file).toBe('src/middleware/rate.ts');
    expect(survived.focus.reason).toBe('Needs careful review.');
  });

  it('carries symbol through UNCHANGED when focus survives (D8, AC-9)', () => {
    const focus = makeReviewFocus('src/app.ts', null, 'applyMiddleware');
    const result = groundBrief([], [focus], makeBlast(), makeSmartDiff());

    const survived = result.groundedFocus[0]!;
    expect(survived.focus.symbol).toBe('applyMiddleware');
    expect(survived.focus.line).toBeNull();
  });

  it('processes multiple focus items independently', () => {
    const validFocus = makeReviewFocus('src/middleware/rate.ts', 42, 'RateLimiter');
    const invalidFocus = makeReviewFocus('src/hallucinated.ts', 1, null);
    const alsoValidFocus = makeReviewFocus('src/app.ts', 10, 'applyMiddleware');

    const result = groundBrief(
      [],
      [validFocus, invalidFocus, alsoValidFocus],
      makeBlast(),
      makeSmartDiff(),
    );

    expect(result.groundedFocus).toHaveLength(2);
    expect(result.droppedFocus).toBe(1);
    expect(result.groundedFocus.map((f) => f.focus.file)).toEqual([
      'src/middleware/rate.ts',
      'src/app.ts',
    ]);
  });

  it('grounding matches on file presence, not line number', () => {
    // A focus pointing at a high line number on a valid file should still survive.
    const focus = makeReviewFocus('src/middleware/rate.ts', 99999, 'nonexistentSymbol');
    const result = groundBrief([], [focus], makeBlast(), makeSmartDiff());

    // File is in evidence — survives regardless of line/symbol.
    expect(result.groundedFocus).toHaveLength(1);
    // line/symbol are NOT changed.
    expect(result.groundedFocus[0]!.focus.line).toBe(99999);
    expect(result.groundedFocus[0]!.focus.symbol).toBe('nonexistentSymbol');
  });
});

// ---- (c) all-risks-dropped is still a valid result --------------------------

describe('all-risks-dropped yields a valid empty-risks result (AC-8 edge case)', () => {
  it('returns empty groundedRisks when ALL risks are ungrounded', () => {
    const risks = [
      makeBriefRisk(['src/hallucinated-a.ts'], 'Risk A'),
      makeBriefRisk(['src/hallucinated-b.ts'], 'Risk B'),
      makeBriefRisk(['src/hallucinated-c.ts'], 'Risk C'),
    ];

    const result = groundBrief(risks, [], makeBlast(), makeSmartDiff());

    expect(result.groundedRisks).toHaveLength(0);
    expect(result.droppedRisks).toBe(3);
    // Still a valid result — not an error.
    expect(result.groundedFocus).toHaveLength(0);
  });

  it('groundBriefToPlain returns empty arrays when all items are dropped', () => {
    const risks = [makeBriefRisk(['src/hallucinated.ts'])];
    const focus = [makeReviewFocus('src/also-hallucinated.ts')];

    const plain = groundBriefToPlain(risks, focus, makeBlast(), makeSmartDiff());

    expect(plain.risks).toEqual([]);
    expect(plain.review_focus).toEqual([]);
  });

  it('works with no blast and no smart-diff — everything is dropped', () => {
    const risks = [makeBriefRisk(['src/some-file.ts'])];
    const focus = [makeReviewFocus('src/some-file.ts')];

    const result = groundBrief(risks, focus, undefined, undefined);

    // No evidence = nothing matches = everything dropped.
    expect(result.groundedRisks).toHaveLength(0);
    expect(result.groundedFocus).toHaveLength(0);
    expect(result.droppedRisks).toBe(1);
    expect(result.droppedFocus).toBe(1);
  });

  it('returns a result object even when inputs are empty arrays', () => {
    const result = groundBrief([], [], makeBlast(), makeSmartDiff());

    expect(result.groundedRisks).toEqual([]);
    expect(result.groundedFocus).toEqual([]);
    expect(result.droppedRisks).toBe(0);
    expect(result.droppedFocus).toBe(0);
  });
});

// ---- (d) AC-10: caller-file flagging ----------------------------------------

describe('AC-10: caller-file flag for ref anchoring', () => {
  it('flags isCallerFileRef=true for a risk grounded via a downstream CALLER file', () => {
    const blast = makeBlast();
    // 'src/app.ts' is a CALLER file in blast.downstream[0].callers[].file.
    const risk = makeBriefRisk(['src/app.ts'], 'Caller-file risk');

    const result = groundBrief([risk], [], blast, undefined);

    expect(result.groundedRisks).toHaveLength(1);
    expect(result.groundedRisks[0]!.isCallerFileRef).toBe(true);
  });

  it('flags isCallerFileRef=false for a risk grounded via a CHANGED file (not a caller)', () => {
    const blast = makeBlast();
    // 'src/middleware/rate.ts' is in changed_symbols (not exclusively a caller file).
    // It also appears in smart-diff but NOT in callers.
    const risk = makeBriefRisk(['src/middleware/rate.ts'], 'Changed-file risk');

    // Ensure 'src/middleware/rate.ts' is NOT in callers (it's not in makeBlast()).
    const result = groundBrief([risk], [], blast, makeSmartDiff());

    expect(result.groundedRisks).toHaveLength(1);
    expect(result.groundedRisks[0]!.isCallerFileRef).toBe(false);
  });

  it('flags focus isCallerFileRef=true when focus.file is a caller file', () => {
    const blast = makeBlast();
    const focus = makeReviewFocus('src/app.ts', 42, 'applyMiddleware');

    const result = groundBrief([], [focus], blast, undefined);

    expect(result.groundedFocus).toHaveLength(1);
    expect(result.groundedFocus[0]!.isCallerFileRef).toBe(true);
  });

  it('flags focus isCallerFileRef=false when focus.file is a changed/smart-diff file', () => {
    const blast = makeBlast();
    // 'pnpm-lock.yaml' is in smart-diff boilerplate, not in callers.
    const focus = makeReviewFocus('pnpm-lock.yaml', null, null);

    const result = groundBrief([], [focus], blast, makeSmartDiff());

    expect(result.groundedFocus).toHaveLength(1);
    expect(result.groundedFocus[0]!.isCallerFileRef).toBe(false);
  });

  it('a file that is BOTH a changed file AND a caller file is flagged isCallerFileRef=true', () => {
    // When the same file appears in both changed_symbols and downstream callers,
    // callerFiles.has() still returns true — the AC-10 flag is set.
    // This is conservative: anchoring to blast.ref is safe even for changed files.
    const blast = makeBlast({
      changed_symbols: [{ name: 'SomeClass', file: 'src/shared-file.ts', kind: 'class' }],
      downstream: [
        {
          symbol: 'SomeClass',
          callers: [{ name: 'callerFn', file: 'src/shared-file.ts', line: 10 }],
          endpoints_affected: [],
          crons_affected: [],
        },
      ],
    });

    const risk = makeBriefRisk(['src/shared-file.ts'], 'Shared-file risk');
    const result = groundBrief([risk], [], blast, undefined);

    expect(result.groundedRisks).toHaveLength(1);
    // callerFiles includes src/shared-file.ts, so isCallerFileRef=true.
    expect(result.groundedRisks[0]!.isCallerFileRef).toBe(true);
  });
});

// ---- (e) buildEvidenceSets: evidence sources --------------------------------

describe('buildEvidenceSets: evidence sources and set membership', () => {
  it('includes changed_symbols[].file in allFiles', () => {
    const blast = makeBlast({ downstream: [] });
    const { allFiles } = buildEvidenceSets(blast, undefined);

    expect(allFiles.has('src/middleware/rate.ts')).toBe(true);
  });

  it('includes downstream callers[].file in BOTH allFiles and callerFiles', () => {
    const blast = makeBlast();
    const { allFiles, callerFiles } = buildEvidenceSets(blast, undefined);

    expect(allFiles.has('src/app.ts')).toBe(true);
    expect(callerFiles.has('src/app.ts')).toBe(true);
  });

  it('changed_symbols files are NOT in callerFiles', () => {
    const blast = makeBlast({
      changed_symbols: [{ name: 'Foo', file: 'src/changed-only.ts', kind: 'fn' }],
      downstream: [],
    });
    const { callerFiles } = buildEvidenceSets(blast, undefined);

    expect(callerFiles.has('src/changed-only.ts')).toBe(false);
  });

  it('includes downstream.endpoints_affected in allFiles', () => {
    const blast = makeBlast();
    const { allFiles } = buildEvidenceSets(blast, undefined);

    expect(allFiles.has('/api/v1/review')).toBe(true);
  });

  it('includes downstream.crons_affected in allFiles', () => {
    const blast = makeBlast();
    const { allFiles } = buildEvidenceSets(blast, undefined);

    expect(allFiles.has('cron:nightly-cleanup')).toBe(true);
  });

  it('includes smartDiff groups[].files[].path in allFiles', () => {
    const { allFiles } = buildEvidenceSets(undefined, makeSmartDiff());

    expect(allFiles.has('src/middleware/rate.ts')).toBe(true);
    expect(allFiles.has('src/utils/helpers.ts')).toBe(true);
    expect(allFiles.has('pnpm-lock.yaml')).toBe(true);
  });

  it('smart-diff paths are NOT in callerFiles', () => {
    const { callerFiles } = buildEvidenceSets(undefined, makeSmartDiff());

    expect(callerFiles.has('src/middleware/rate.ts')).toBe(false);
    expect(callerFiles.has('pnpm-lock.yaml')).toBe(false);
  });

  it('returns empty sets when both blast and smartDiff are undefined', () => {
    const { allFiles, callerFiles } = buildEvidenceSets(undefined, undefined);

    expect(allFiles.size).toBe(0);
    expect(callerFiles.size).toBe(0);
  });

  it('returns empty sets when blast has empty arrays', () => {
    const blast: BlastRadius = {
      summary: '',
      changed_symbols: [],
      downstream: [],
    };
    const { allFiles, callerFiles } = buildEvidenceSets(blast, undefined);

    expect(allFiles.size).toBe(0);
    expect(callerFiles.size).toBe(0);
  });

  it('callerFiles is a strict subset of allFiles', () => {
    const blast = makeBlast();
    const { allFiles, callerFiles } = buildEvidenceSets(blast, makeSmartDiff());

    for (const f of callerFiles) {
      expect(allFiles.has(f)).toBe(true);
    }
  });
});

// ---- groundBriefToPlain: convenience wrapper --------------------------------

describe('groundBriefToPlain: plain-array convenience wrapper', () => {
  it('returns plain BriefRisk[] and ReviewFocus[] without AC-10 flags', () => {
    const blast = makeBlast();
    const risks = [
      makeBriefRisk(['src/middleware/rate.ts'], 'Valid'),
      makeBriefRisk(['src/hallucinated.ts'], 'Invalid'),
    ];
    const focus = [
      makeReviewFocus('src/app.ts', 10, null),
      makeReviewFocus('src/gone.ts', 20, null),
    ];

    const plain = groundBriefToPlain(risks, focus, blast, makeSmartDiff());

    expect(plain.risks).toHaveLength(1);
    expect(plain.risks[0]!.title).toBe('Valid');
    expect(plain.review_focus).toHaveLength(1);
    expect(plain.review_focus[0]!.file).toBe('src/app.ts');
  });
});
