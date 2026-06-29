#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

function git(args) {
  const result = spawnSync('git', args, {
    cwd: projectDir,
    encoding: null,
    windowsHide: true,
  });

  if (result.status !== 0) {
    throw new Error(result.stderr?.toString('utf8').trim() || `git ${args.join(' ')} failed`);
  }

  return result.stdout;
}

function repoState() {
  const head = git(['rev-parse', 'HEAD']).toString('utf8').trim();
  const hash = createHash('sha256');

  hash.update('staged\0');
  hash.update(git(['diff', '--cached', '--no-ext-diff', '--binary', 'HEAD']));
  hash.update('unstaged\0');
  hash.update(git(['diff', '--no-ext-diff', '--binary']));

  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'])
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .sort();

  for (const file of untracked) {
    hash.update('untracked\0');
    hash.update(file);
    hash.update('\0');
    hash.update(readFileSync(resolve(projectDir, file)));
  }

  return `${head} ${hash.digest('hex')}`;
}

function markerPath() {
  const gitDir = git(['rev-parse', '--git-dir']).toString('utf8').trim();
  return resolve(projectDir, gitDir, 'pr-self-review-pass');
}

function deny(reason) {
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  })}\n`);
}

if (process.argv.includes('--write-marker')) {
  writeFileSync(markerPath(), `${repoState()}\n`, 'utf8');
  process.exit(0);
}

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const command = input?.tool_input?.command;
const isGitHubBound = typeof command === 'string'
  && /(?:^|[\s;&|])(?:gh\s+pr\s+create|git\s+push)(?=$|[\s;&|])/.test(command);

if (!isGitHubBound) {
  process.exit(0);
}

try {
  const current = repoState();
  let expected = '';

  try {
    expected = readFileSync(markerPath(), 'utf8').trim();
  } catch {
    // A missing marker is the normal pre-review state.
  }

  if (current !== expected) {
    deny(`PR self-review gate: no current PASS for this state (${current}). Run /pr-self-review and resolve any CRITICAL findings before gh pr create / git push.`);
  }
} catch (error) {
  deny(`PR self-review gate: unable to verify repository state (${error.message}). Run /pr-self-review before gh pr create / git push.`);
}
