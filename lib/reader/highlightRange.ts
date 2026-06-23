/**
 * Highlight anchoring for the HTML reader. Offsets are character indices into a
 * block's normalized textContent (the in-order concatenation of its descendant
 * text nodes). The same text-node walk is used at creation and at render time,
 * so offsets stay consistent across inline markup (<em>, <a>, <code>).
 */

/** Sum of text-node lengths before nodeIndex, plus the in-node offset. */
export function absoluteOffset(
  nodeLengths: number[],
  nodeIndex: number,
  offsetInNode: number,
): number {
  let total = 0;
  for (let i = 0; i < nodeIndex; i++) total += nodeLengths[i] ?? 0;
  return total + offsetInNode;
}

export interface WrapSpan {
  nodeIndex: number;
  from: number;
  to: number;
}

/**
 * Given a block's text-node lengths (document order) and an absolute [start, end)
 * range over their concatenation, return the per-node sub-spans the range covers.
 * Nodes fully outside the range are omitted; the offsets in each span are local
 * to that node.
 */
export function rangesToWrap(nodeLengths: number[], start: number, end: number): WrapSpan[] {
  const spans: WrapSpan[] = [];
  let pos = 0;
  for (let i = 0; i < nodeLengths.length; i++) {
    const len = nodeLengths[i] ?? 0;
    const nodeStart = pos;
    const nodeEnd = pos + len;
    const from = Math.max(start, nodeStart);
    const to = Math.min(end, nodeEnd);
    if (to > from) spans.push({ nodeIndex: i, from: from - nodeStart, to: to - nodeStart });
    pos = nodeEnd;
  }
  return spans;
}
