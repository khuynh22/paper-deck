import { test, expect } from "vitest";
import { resolveResumeTarget, blocksUpTo, isLastBlock } from "@/lib/reader/anchor";

test("prefers a valid block anchor over scroll pct", () => {
  expect(resolveResumeTarget({ blockAnchor: "12", scrollPct: 0.4 }, ["0", "12", "20"])).toEqual({
    type: "anchor",
    value: "12",
  });
});

test("falls back to scroll pct when the anchor no longer exists", () => {
  expect(resolveResumeTarget({ blockAnchor: "99", scrollPct: 0.4 }, ["0", "12"])).toEqual({
    type: "pct",
    value: 0.4,
  });
});

test("falls back to scroll pct when there is no anchor", () => {
  expect(resolveResumeTarget({ blockAnchor: null, scrollPct: 0.7 }, ["0"])).toEqual({
    type: "pct",
    value: 0.7,
  });
});

test("blocksUpTo returns the read set up to and including the mark", () => {
  expect(blocksUpTo("2", ["0", "1", "2", "3"])).toEqual(["0", "1", "2"]);
});

test("blocksUpTo is empty with no mark", () => {
  expect(blocksUpTo(null, ["0", "1"])).toEqual([]);
});

test("isLastBlock detects the final block", () => {
  expect(isLastBlock("3", ["0", "1", "2", "3"])).toBe(true);
  expect(isLastBlock("1", ["0", "1", "2", "3"])).toBe(false);
  expect(isLastBlock(null, ["0"])).toBe(false);
});
