import { test, expect } from "vitest";
import {
  absoluteOffset,
  rangesToWrap,
  offsetsFromSelection,
  decorateBlock,
  clearHighlights,
  MARK_CLASS,
  type DecorateTarget,
} from "@/lib/reader/highlightRange";

test("absoluteOffset sums prior node lengths plus the in-node offset", () => {
  expect(absoluteOffset([5, 3, 8], 0, 2)).toBe(2);
  expect(absoluteOffset([5, 3, 8], 1, 1)).toBe(6); // 5 + 1
  expect(absoluteOffset([5, 3, 8], 2, 4)).toBe(12); // 5 + 3 + 4
});

test("rangesToWrap covers a single node", () => {
  expect(rangesToWrap([10], 2, 6)).toEqual([{ nodeIndex: 0, from: 2, to: 6 }]);
});

test("rangesToWrap splits a range across multiple nodes", () => {
  // nodes: [0..5) [5..8) [8..16); range [3, 12)
  expect(rangesToWrap([5, 3, 8], 3, 12)).toEqual([
    { nodeIndex: 0, from: 3, to: 5 },
    { nodeIndex: 1, from: 0, to: 3 },
    { nodeIndex: 2, from: 0, to: 4 },
  ]);
});

test("rangesToWrap omits nodes fully outside the range", () => {
  expect(rangesToWrap([4, 4, 4], 5, 7)).toEqual([{ nodeIndex: 1, from: 1, to: 3 }]);
});

function block(html: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-blk", "0");
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

function selectRange(node: Node, start: number, end: number): Range {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  return range;
}

test("offsetsFromSelection returns offsets + quote across inline markup", () => {
  // textContent = "Diffusion models are great"  (em wraps "models")
  const el = block("Diffusion <em>models</em> are great");
  const emText = el.querySelector("em")!.firstChild!; // "models"
  const r = selectRange(emText, 0, 6); // "models"
  expect(offsetsFromSelection(el, r)).toEqual({ start: 10, end: 16, quote: "models" });
});

test("offsetsFromSelection returns null for a collapsed selection", () => {
  const el = block("hello world");
  const r = selectRange(el.firstChild!, 3, 3);
  expect(offsetsFromSelection(el, r)).toBeNull();
});

test("offsetsFromSelection clamps an end that runs past the block", () => {
  const el = block("abcdef");
  const r = document.createRange();
  r.setStart(el.firstChild!, 2);
  r.setEndAfter(el); // end outside the block's text nodes
  const res = offsetsFromSelection(el, r);
  expect(res).toEqual({ start: 2, end: 6, quote: "cdef" });
});

test("decorateBlock wraps the range in a mark and skips drifted quotes", () => {
  const el = block("Diffusion models are great");
  const targets: DecorateTarget[] = [
    { id: "h1", startOffset: 10, endOffset: 16, quote: "models", hasNote: true },
    { id: "h2", startOffset: 0, endOffset: 9, quote: "STALE!!!", hasNote: false }, // drift → skip
  ];
  const clicked: string[] = [];
  decorateBlock(el, targets, (id) => clicked.push(id));

  const marks = el.querySelectorAll(`mark.${MARK_CLASS}`);
  expect(marks.length).toBe(1);
  expect(marks[0].textContent).toBe("models");
  expect((marks[0] as HTMLElement).dataset.hlId).toBe("h1");
  expect((marks[0] as HTMLElement).dataset.hlNote).toBe("1");

  (marks[0] as HTMLElement).click();
  expect(clicked).toEqual(["h1"]);
});

test("clearHighlights removes marks and restores plain text", () => {
  const el = block("Diffusion models are great");
  decorateBlock(
    el,
    [{ id: "h1", startOffset: 10, endOffset: 16, quote: "models", hasNote: false }],
    () => {},
  );
  expect(el.querySelectorAll(`mark.${MARK_CLASS}`).length).toBe(1);
  clearHighlights(el);
  expect(el.querySelectorAll(`mark.${MARK_CLASS}`).length).toBe(0);
  expect(el.textContent).toBe("Diffusion models are great");
});
