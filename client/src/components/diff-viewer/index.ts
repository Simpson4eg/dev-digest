/* diff-viewer — unified-diff viewer with optional inline GitHub comments.
   Public surface: the DiffViewer component + the DiffCommentApi contract, plus
   the finding-reveal context/anchor helpers used by the finding-navigator. */
export { DiffViewer } from "./DiffViewer";
export { lineAnchorId } from "./FileCard";
export { RevealContext } from "./reveal";
export type { RevealTarget, DiffFinding } from "./reveal";
export type { DiffCommentApi } from "./comments";
