"use client";

import React from "react";

/** A finding the diff viewer should reveal + scroll to. */
export interface RevealTarget {
  path: string;
  line: number;
  /** Monotonic id so consumers re-fire even when path/line repeat. */
  nonce: number;
}

/**
 * Broadcast within a diff subtree so a `FileCard` (and, in Smart order, its
 * group) can open itself when it holds the finding the finding-navigator jumped
 * to. Null when nothing is being revealed. Kept a context (not prop-drilling) so
 * both the Smart and Original renderers can consume it without extra plumbing.
 */
export const RevealContext = React.createContext<RevealTarget | null>(null);

/**
 * A review finding projected onto the diff: enough to render the badge, the
 * range highlight, the jump anchor (at `startLine`), and the inline note card.
 * Built on the client from the latest review's findings.
 */
export interface DiffFinding {
  id: string;
  severity: "CRITICAL" | "WARNING" | "SUGGESTION";
  title: string;
  rationale: string;
  suggestion?: string | null;
  /** New-file line numbers (match the diff's `newNo`). */
  startLine: number;
  endLine: number;
}
