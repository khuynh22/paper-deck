import { test, expect } from "vitest";
import { nextStarState } from "@/lib/star";

test("toggles star state", () => {
  expect(nextStarState(true)).toBe(false);
  expect(nextStarState(false)).toBe(true);
});
