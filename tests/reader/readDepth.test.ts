import { test, expect } from "vitest";
import { readBoundaryFraction, readDepthFraction, isComplete, DONE_THRESHOLD } from "@/lib/reader/readDepth";

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

test("readBoundaryFraction: viewport bottom relative to the content box", () => {
  // content top flush with viewport top (rectTop 0), 200px screen, 1000px content
  // => first screen (200) / 1000 = 0.2
  expect(readBoundaryFraction(200, 0, 1000)).toBeCloseTo(0.2);
  // scrolled so content top is 300px above the viewport => (200 + 300) / 1000
  expect(readBoundaryFraction(200, -300, 1000)).toBeCloseTo(0.5);
  // content fully scrolled past the bottom => clamps to 1
  expect(readBoundaryFraction(200, -2000, 1000)).toBe(1);
  // content starts below the viewport bottom => clamps to 0
  expect(readBoundaryFraction(200, 500, 1000)).toBe(0);
  // zero-height content => 0 (no divide-by-zero)
  expect(readBoundaryFraction(200, 0, 0)).toBe(0);
});
