import { simpleGit, type SimpleGit } from 'simple-git';
import { join, resolve, sep, relative } from 'node:path';
import { mkdir, readFile, access, rm, glob, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import type {
  GitClient,
  RepoRef,
  CloneOptions,
  UnifiedDiff,
  BlameLine,
  GitCommit,
} from '@devdigest/shared';
import { parseUnifiedDiff } from './diff-parser.js';

/**
 * Depth fetched by `sync()`. Deeper than the shallow clone (CLONE_DEPTH=1) so the
 * previously-indexed sha is usually reachable, keeping the resync diff incremental;
 * when it isn't, the indexer falls back to a full reindex.
 */
const RESYNC_FETCH_DEPTH = 50;

/**
 * GitClient over simple-git. Repos clone to
 * `<cloneDir>/<owner>/<repo>`. We NEVER execute repo code — only git ops.
 */
export class SimpleGitClient implements GitClient {
  constructor(private cloneDir: string) {
    // Force non-interactive auth so an unauthenticated/private clone fails in
    // ~1s with a clear error instead of hanging on a credential prompt until the
    // job timeout. Set on process.env (inherited by git subprocesses) rather
    // than via simple-git's .env(), which inspects and rejects vars like
    // PAGER/EDITOR present in the shell environment.
    process.env.GIT_TERMINAL_PROMPT ??= '0';
    process.env.GCM_INTERACTIVE ??= 'never';
  }

  clonePathFor(repo: RepoRef): string {
    return join(this.cloneDir, repo.owner, repo.name);
  }

  private git(repo: RepoRef): SimpleGit {
    return simpleGit(this.clonePathFor(repo));
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async clone(repo: RepoRef, url: string, opts?: CloneOptions): Promise<{ path: string }> {
    const dest = this.clonePathFor(repo);
    await mkdir(join(this.cloneDir, repo.owner), { recursive: true });
    if (await this.exists(join(dest, '.git'))) {
      // already cloned → fetch latest
      await simpleGit(dest).fetch();
      return { path: dest };
    }
    // A prior clone may have timed out mid-write, leaving a partial dir without
    // a .git — git clone refuses a non-empty dest, so clear it first.
    if (await this.exists(dest)) await rm(dest, { recursive: true, force: true });
    const args: string[] = [];
    if (opts?.depth) args.push('--depth', String(opts.depth));
    if (opts?.branch) args.push('--branch', opts.branch);
    await simpleGit(this.cloneDir).clone(url, dest, args);
    return { path: dest };
  }

  async fetchPullHead(repo: RepoRef, n: number): Promise<void> {
    // Fetch the PR head ref into a local ref (GitHub exposes pull/<n>/head).
    await this.git(repo).fetch(['origin', `pull/${n}/head:pr-${n}`]);
  }

  async sync(repo: RepoRef, branch: string): Promise<{ head: string }> {
    // Resync the read-only mirror to upstream. A bare `fetch` only moves
    // `origin/<branch>`, so we `reset --hard` to advance local HEAD + worktree —
    // safe here because we never commit to or run code from the clone.
    // Fetch a bounded depth (> the shallow CLONE_DEPTH) so the prior indexed sha
    // is usually reachable for an incremental diff; the indexer falls back to a
    // full reindex when it isn't.
    const g = this.git(repo);
    await g.fetch(['origin', branch, '--depth', String(RESYNC_FETCH_DEPTH)]);
    await g.reset(['--hard', `origin/${branch}`]);
    return { head: (await g.revparse(['HEAD'])).trim() };
  }

  async currentHead(repo: RepoRef): Promise<string> {
    return (await this.git(repo).revparse(['HEAD'])).trim();
  }

  async diff(repo: RepoRef, base: string, head: string): Promise<UnifiedDiff> {
    const raw = await this.git(repo).diff([`${base}...${head}`]);
    return parseUnifiedDiff(raw);
  }

  /**
   * `git diff --name-only base..head` — used by the incremental indexer to
   * pick the file set that changed since `last_indexed_sha`. Two-dot is
   * intentional (commits reachable from `head` but not `base`), unlike the
   * three-dot symmetric form `diff()` uses for review diffs.
   */
  async diffNameOnly(repo: RepoRef, base: string, head: string): Promise<string[]> {
    if (base === head) return [];
    const raw = await this.git(repo).raw(['diff', '--name-only', `${base}..${head}`]);
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  async blame(repo: RepoRef, path: string): Promise<BlameLine[]> {
    const raw = await this.git(repo).raw(['blame', '--line-porcelain', path]);
    return parseBlamePorcelain(raw);
  }

  async log(repo: RepoRef, path?: string): Promise<GitCommit[]> {
    const log = await this.git(repo).log(path ? { file: path } : undefined);
    return log.all.map((c) => ({
      sha: c.hash,
      message: c.message,
      author: c.author_name,
      date: c.date,
    }));
  }

  async readFile(repo: RepoRef, path: string): Promise<string> {
    const cloneDir = this.clonePathFor(repo);
    const resolved = resolve(join(cloneDir, path));
    // Ensure the resolved path stays strictly inside the clone directory.
    // Trailing sep prevents a clone at /a/b matching a path like /a/bEvil/x.
    const base = cloneDir.endsWith(sep) ? cloneDir : cloneDir + sep;
    if (!resolved.startsWith(base)) {
      throw new Error(`Path "${path}" escapes the clone directory`);
    }
    return readFile(resolved, 'utf8');
  }

  /**
   * Discover files matching `globs` in the cloned repo. Returns repo-relative
   * paths (forward-slash separated, no leading slash), containment-checked.
   *
   * Security design:
   *  PRIMARY defence — each discovered path is resolved and verified to start
   *  with `base + sep` (mirrors readFile's check at the lines above).
   *  SECONDARY defence — symlinks are excluded via `lstat`; a symlink that
   *  resolves outside the tree would pass the startsWith check only if the
   *  real path is inside, but excluding symlinks entirely is defence-in-depth.
   *  Windows guard — `path.isAbsolute('/x')` is false on Windows, so the
   *  startsWith(base+sep) check is the reliable barrier (not isAbsolute).
   *
   * Returns [] when the clone directory does not exist (repo not yet cloned).
   */
  async listFiles(repo: RepoRef, globs: string[]): Promise<string[]> {
    const cloneDir = this.clonePathFor(repo);
    const base = cloneDir.endsWith(sep) ? cloneDir : cloneDir + sep;

    // Bail early if the repo isn't cloned yet.
    if (!(await this.exists(cloneDir))) return [];

    // Use a Set to deduplicate paths discovered by multiple overlapping globs
    // (e.g., a file at specs/docs/guide.md matches both patterns).
    const seen = new Set<string>();
    const results: string[] = [];
    for (const pattern of globs) {
      // FIX 2 (robustness): wrap per-pattern glob in try/catch so a malformed
      // pattern (e.g. a folder name containing a glob metacharacter or brace)
      // degrades to an empty contribution rather than surfacing as a 500.
      try {
        for await (const entry of glob(pattern, { cwd: cloneDir })) {
          // `entry` is an OS-native relative path (may use backslash on Windows).
          // Resolve to absolute for the containment check.
          const abs = resolve(join(cloneDir, entry));

          // PRIMARY containment check — reuse the same invariant as readFile.
          if (!abs.startsWith(base)) continue;

          // SECONDARY: exclude symlinks so a symlinked directory named specs/
          // docs/ insights/ cannot point outside the repo tree.
          let stat;
          try {
            stat = await lstat(abs);
          } catch {
            // Path vanished between glob and lstat — skip.
            continue;
          }
          if (stat.isSymbolicLink()) continue;

          // Normalise to forward-slash repo-relative path and deduplicate.
          const rel = relative(cloneDir, abs).replace(/\\/g, '/');
          if (!seen.has(rel)) {
            seen.add(rel);
            results.push(rel);
          }
        }
      } catch {
        // Malformed pattern (e.g. brace/metachar in a folder name) — skip this
        // pattern and continue with the rest. Degrades to {} docs from this
        // pattern rather than throwing, consistent with the empty-repo contract.
      }
    }
    return results;
  }
}

function parseBlamePorcelain(raw: string): BlameLine[] {
  const out: BlameLine[] = [];
  const lines = raw.split('\n');
  let sha = '';
  let author = '';
  let date = '';
  let summary = '';
  let lineNo = 0;
  for (const line of lines) {
    const header = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/);
    if (header) {
      sha = header[1]!;
      lineNo = Number(header[2]);
    } else if (line.startsWith('author ')) author = line.slice(7);
    else if (line.startsWith('author-time '))
      date = new Date(Number(line.slice(12)) * 1000).toISOString();
    else if (line.startsWith('summary ')) summary = line.slice(8);
    else if (line.startsWith('\t')) {
      out.push({ line: lineNo, sha, author, date, summary });
    }
  }
  return out;
}
