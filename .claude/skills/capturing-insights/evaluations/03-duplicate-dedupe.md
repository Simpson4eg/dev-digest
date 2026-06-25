# Eval 03 — duplicate finding updates instead of duplicating

Tests that checkpoint 2 (dedupe) actually prevents parallel entries.

## Setup

`server/INSIGHTS.md → ## Recurring Errors & Fixes` already contains:

```
- 2026-06-19 · `writeFileAt` test helper uses `lastIndexOf('/')` and silently
  skips `mkdir` on Windows, causing 6 ENOENT failures in
  `runIncremental → diff failure` paths.
  evidence: `server/test/indexer-pipeline.test.ts:142`
  path.join on Windows returns backslash-separated paths, so the helper's
  '/'.lastIndexOf returns -1 ...
```

## Scenario

A week later: user runs the integration suite on a fresh Windows box, hits
the same ENOENT failures, asks the agent to investigate.

Files touched: none yet (read-only investigation).

## Expected behavior

1. **Checkpoint 1 fires.** Agent reads `server/INSIGHTS.md`. Top-3 summary
   includes the existing `writeFileAt` entry.
2. The agent recognises that the finding is already captured.
3. **Checkpoint 2 fires before any write.** Re-read the target section;
   confirm partial-or-exact match.
4. Outcome — one of:
   - **Exact match** (same evidence, same root cause) → **skip the write**.
     Tell the user: `Already captured at server/INSIGHTS.md → Recurring
     Errors & Fixes; no new entry.`
   - **Partial match** (new evidence, same root cause — e.g., a new path
     line:line range where the bug also manifests) → **update the existing
     entry**: append today's date and the new `file:line` to the same bullet.
     Don't create a parallel bullet.

## Failure modes to catch

- Agent writes a second, near-identical entry with today's date → duplicate
  poison; the file decays fast.
- Agent overwrites the original entry, losing the original date and the
  paragraph of context → violates "Append-only / Never overwrite."
- Agent silently does nothing without telling the user — confirmation is part
  of the contract.
