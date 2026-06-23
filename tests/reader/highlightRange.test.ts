import { test, expect } from "vitest";
import { absoluteOffset, rangesToWrap } from "@/lib/reader/highlightRange";

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
