Run the `engineering-insights` skill against the current session.

Walk through the three checkpoints from the skill:

1. **Pre-write read** — re-read every `INSIGHTS.md` for packages this session
   touched. Confirm in one line what you read.
2. **Pre-write dedupe** — for each candidate entry, check the target section
   for overlap; update existing entries instead of duplicating.
3. **Signal check** — write only what's genuinely non-obvious and not already
   captured. If nothing qualifies, say so explicitly and write nothing.

Use the entry format defined in `.claude/skills/engineering-insights/SKILL.md`.
Apply the quality bar from `examples.md`. Route entries to the correct
package's `INSIGHTS.md` (`server/`, `client/`, `reviewer-core/`, `e2e/`).

This command is a manual fallback for when auto-discovery doesn't fire — the
skill is normally invoked automatically when you finish a code change.
