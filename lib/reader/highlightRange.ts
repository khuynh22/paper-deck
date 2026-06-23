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

export const MARK_CLASS = "pd-highlight";

/** Ordered descendant text nodes of a block (includes those inside <math>). */
export function textNodesOf(block: Element): Text[] {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  return nodes;
}

function isInsideMath(node: Node): boolean {
  let el: Element | null = node.parentElement;
  while (el) {
    if (el.tagName.toLowerCase() === "math") return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * Compute {start, end, quote} for a selection Range, as offsets into the block's
 * textContent, clamped to the block. Returns null when the selection is collapsed,
 * starts outside the block, has non-text endpoints, or its endpoints are inside a
 * <math> subtree.
 */
export function offsetsFromSelection(
  block: Element,
  range: Range,
): { start: number; end: number; quote: string } | null {
  if (range.collapsed) return null;
  const nodes = textNodesOf(block);
  if (nodes.length === 0) return null;
  const lengths = nodes.map((t) => t.data.length);

  const startIdx = nodes.indexOf(range.startContainer as Text);
  if (startIdx === -1 || isInsideMath(nodes[startIdx])) return null;
  const start = absoluteOffset(lengths, startIdx, range.startOffset);

  const total = lengths.reduce((a, b) => a + b, 0);
  const endIdx = nodes.indexOf(range.endContainer as Text);
  let end: number;
  if (endIdx === -1) {
    end = total; // selection runs past this block — clamp to its end
  } else {
    if (isInsideMath(nodes[endIdx])) return null;
    end = absoluteOffset(lengths, endIdx, range.endOffset);
  }
  if (end <= start) return null;

  const quote = nodes
    .map((t) => t.data)
    .join("")
    .slice(start, end);
  if (!quote) return null;
  return { start, end, quote };
}

export interface DecorateTarget {
  id: string;
  startOffset: number;
  endOffset: number;
  quote: string;
  hasNote: boolean;
}

/**
 * Paint each highlight as a <mark> inside the block. Recomputes text nodes per
 * highlight (so already-painted marks are accounted for), skips a highlight whose
 * quote no longer matches the live slice (drift), and skips sub-spans inside <math>.
 */
export function decorateBlock(
  block: Element,
  highlights: DecorateTarget[],
  onClick: (id: string) => void,
): void {
  for (const h of highlights) {
    const nodes = textNodesOf(block);
    const lengths = nodes.map((t) => t.data.length);
    const text = nodes.map((t) => t.data).join("");
    if (text.slice(h.startOffset, h.endOffset) !== h.quote) continue; // drift — skip

    // Resolve to concrete node references BEFORE mutating; each is wrapped once,
    // so wrapping one (which splits only that text node) never invalidates another.
    const targets = rangesToWrap(lengths, h.startOffset, h.endOffset)
      .map((s) => ({ node: nodes[s.nodeIndex], from: s.from, to: s.to }))
      .filter((t) => t.node && !isInsideMath(t.node));
    for (const t of targets) wrapTextRange(t.node, t.from, t.to, h, onClick);
  }
}

function wrapTextRange(
  node: Text,
  from: number,
  to: number,
  h: DecorateTarget,
  onClick: (id: string) => void,
): void {
  const range = document.createRange();
  range.setStart(node, from);
  range.setEnd(node, to);
  const mark = document.createElement("mark");
  mark.className = MARK_CLASS;
  mark.dataset.hlId = h.id;
  if (h.hasNote) mark.dataset.hlNote = "1";
  mark.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick(h.id);
  });
  range.surroundContents(mark);
}

/** Unwrap every highlight mark under root, restoring plain text. */
export function clearHighlights(root: Element): void {
  root.querySelectorAll(`mark.${MARK_CLASS}`).forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize(); // merge the split text nodes back together
  });
}
