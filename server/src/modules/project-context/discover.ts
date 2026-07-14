// Pure discovery core for Project Context (AC-1, AC-2, AC-3, AC-13).
//
// Given a list of repo-relative paths and the configured folder-name list,
// filter down to paths whose path segments contain at least one of the folder
// names. This is a pure function (no IO, no Container) so it is hermetic to
// test. The glob patterns used at the adapter layer are built by
// buildContextGlobs; filterContextPaths is the independently-testable core.
// Zero LLM (AC-13).

/**
 * Build the glob patterns for `GitClient.listFiles` from the configured
 * folder-name list (AC-2: taken from config, not hard-coded at the call site).
 */
export function buildContextGlobs(folderNames: string[]): string[] {
  return folderNames.map((name) => `**/${name}/**/*.md`);
}

/**
 * Filter a flat list of repo-relative paths to those that contain at least
 * one path segment matching a configured folder name, and end in `.md`.
 *
 * This function is the testable core: given an in-memory path list and folder
 * names, return the subset that qualifies as context docs.
 *
 * Paths use forward slashes (normalised by `GitClient.listFiles`).
 */
export function filterContextPaths(paths: string[], folderNames: string[]): string[] {
  if (folderNames.length === 0) return [];
  const nameSet = new Set(folderNames);
  return paths.filter((p) => {
    if (!p.endsWith('.md')) return false;
    // Split on '/' (paths are already forward-slash normalised).
    const segments = p.split('/');
    // Exclude the last segment (the filename) — only directory segments count.
    const dirs = segments.slice(0, -1);
    return dirs.some((seg) => nameSet.has(seg));
  });
}
