import { test, expect } from "vitest";
import { readDepthFraction, isComplete, DONE_THRESHOLD } from "@/lib/reader/readDepth";

test("read depth is the viewport bottom as a fraction of document height", () => {
  expect(readDepthFraction(0, 100, 1000)).toBe(0.1); // first screen is on-screen => read
  expect(readDepthFraction(400, 100, 1000)).toBeCloseTo(0.5);
});

test("read depth reaches 1 when the viewport bottom hits the document bottom", () => {
  expect(readDepthFraction(900, 100, 1000)).toBe(1);
});

test("read depth clamps to 0..1 and tolerates a zero-height document", () => {
  expect(readDepthFraction(5000, 100, 1000)).toBe(1);
  expect(readDepthFraction(-50, 10, 1000)).toBe(0);
  expect(readDepthFraction(0, 100, 0)).toBe(0);
});

test("isComplete trips at the done threshold", () => {
  expect(isComplete(DONE_THRESHOLD)).toBe(true);
  expect(isComplete(0.97)).toBe(false);
  expect(isComplete(1)).toBe(true);
});
