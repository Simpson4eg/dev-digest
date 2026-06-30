import type { ConventionCandidate } from '@devdigest/shared';

export interface ConventionRow {
  id: string;
  workspaceId: string;
  repoId: string | null;
  rule: string;
  category: string | null;
  evidencePath: string | null;
  evidenceLine: number | null;
  evidenceSnippet: string | null;
  confidence: number | null;
  status: 'candidate' | 'accepted' | 'rejected';
  accepted: boolean;
  createdAt: Date;
}

export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    rule: row.rule,
    category: row.category,
    evidence_path: row.evidencePath,
    evidence_line: row.evidenceLine,
    evidence_snippet: row.evidenceSnippet,
    confidence: row.confidence,
    status: row.status,
    created_at: row.createdAt.toISOString(),
  };
}

/** Build a GitHub blob URL from repo owner/name, branch, file path, and optional line. */
export function toGitHubFileUrl(
  owner: string,
  name: string,
  branch: string,
  filePath: string,
  line?: number | null,
): string {
  const base = `https://github.com/${owner}/${name}/blob/${branch}/${filePath}`;
  return line != null ? `${base}#L${line}` : base;
}

/** Merge accepted convention candidates into a single skill body (markdown). */
export function buildSkillBody(candidates: ConventionCandidate[]): string {
  const sections = candidates.map((c) => {
    const header = c.category ? `## ${c.category}` : '## convention';
    const evidence =
      c.evidence_path
        ? `Detected in \`${c.evidence_path}${c.evidence_line != null ? `:${c.evidence_line}` : ''}\``
        : '';
    const snippet = c.evidence_snippet ? `\n\`\`\`\n${c.evidence_snippet}\n\`\`\`` : '';
    return [header, '', c.rule, evidence, snippet].filter((l) => l !== undefined).join('\n').trimEnd();
  });
  return sections.join('\n\n');
}
