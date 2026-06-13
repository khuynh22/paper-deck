/**
 * Read-depth math, independent of the DOM so it can be unit tested.
 *
 * Read depth is the deepest point that has reached the BOTTOM of the viewport,
 * as a fraction (0–1) of the document height. The reader tracks the running max
 * of this value — it only ever increases — to drive the left-margin "read" rail.
 */

/** At/above this fraction the paper counts as finished (status -> done). */
export const DONE_THRESHOLD = 0.98;

/** The viewport bottom as a fraction of document height, clamped to 0..1. */
export function readDepthFraction(
  scrollY: number,
  viewportHeight: number,
  docHeight: number,
): number {
  if (docHeight <= 0) return 0;
  return Math.min(1, Math.max(0, (scrollY + viewportHeight) / docHeight));
}

/** Has the reader scrolled far enough to count the paper as finished? */
export function isComplete(readPct: number): boolean {
  return readPct >= DONE_THRESHOLD;
}
