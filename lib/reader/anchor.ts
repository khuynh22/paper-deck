/**
 * Pure resume/highlight logic, independent of the DOM so it can be unit tested.
 * The reader components feed it the live anchor list + saved progress.
 */

export type ResumeTarget =
  | { type: "anchor"; value: string }
  | { type: "pct"; value: number };

/**
 * Decide where to resume: prefer the precise saved block anchor when it still
 * exists in the rendered document, otherwise fall back to the scroll percentage
 * (which always recovers even if the content re-rendered).
 */
export function resolveResumeTarget(
  p: { blockAnchor: string | null; scrollPct: number },
  validAnchors: string[],
): ResumeTarget {
  if (p.blockAnchor && validAnchors.includes(p.blockAnchor)) {
    return { type: "anchor", value: p.blockAnchor };
  }
  return { type: "pct", value: p.scrollPct };
}

/** The ordered anchors strictly above the marked one — i.e. the "already read" set. */
export function blocksUpTo(marked: string | null, ordered: string[]): string[] {
  if (!marked) return [];
  const idx = ordered.indexOf(marked);
  return idx < 0 ? [] : ordered.slice(0, idx);
}

/** Is the marked anchor the final block? (used to flip status -> done) */
export function isLastBlock(marked: string | null, ordered: string[]): boolean {
  if (!marked || ordered.length === 0) return false;
  return ordered[ordered.length - 1] === marked;
}
