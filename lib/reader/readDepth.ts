/**
 * Read-depth math, independent of the DOM so it can be unit tested.
 *
 * Read depth is the current viewport BOTTOM as a fraction (0–1) of the document
 * height. The reader tracks this live value (it rises and falls with scrolling)
 * to drive the left-margin "read" rail, so scrolling back up lowers the rail.
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
