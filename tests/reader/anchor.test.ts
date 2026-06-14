import { test, expect } from "vitest";
import { resolveResumeTarget } from "@/lib/reader/anchor";

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
