import { describe, it, expect } from "vitest";
import {
  EMPTY_CRITERIA,
  validateInterest,
  describeCriteria,
} from "@/lib/interests/params";
describe("private interest criteria", () => {
  it("preserves the established discovery filters and exact author name", () => {
    expect(
      validateInterest("  Research  ", {
        ...EMPTY_CRITERIA,
        q: " diffusion ",
        topic: "cs.AI",
        venue: "ICLR",
        author: " Alex Kim ",
        from: "2026-01-01",
        to: "2026-12-31",
      }),
    ).toEqual({
      name: "Research",
      criteria: {
        q: "diffusion",
        topic: "cs.AI",
        venue: "ICLR",
        author: "Alex Kim",
        from: "2026-01-01",
        to: "2026-12-31",
      },
    });
  });
  it("rejects empty, malformed, inverted or oversized input rather than widening a follow", () => {
    for (const raw of [
      null,
      {},
      EMPTY_CRITERIA,
      { ...EMPTY_CRITERIA, q: "x", topic: "bad topic" },
      { ...EMPTY_CRITERIA, q: "x", from: "2026-02-30" },
      { ...EMPTY_CRITERIA, from: "2026-02-01", to: "2026-01-01" },
      { ...EMPTY_CRITERIA, author: "x".repeat(201) },
      { ...EMPTY_CRITERIA, q: ["x"] },
      { ...EMPTY_CRITERIA, author: "A\nB" },
    ])
      expect(validateInterest("Name", raw)).toBeNull();
    expect(validateInterest(" ", { ...EMPTY_CRITERIA, q: "x" })).toBeNull();
  });
  it("explains each combined criterion without treating author names as IDs", () => {
    expect(
      describeCriteria({
        ...EMPTY_CRITERIA,
        q: '"world models"',
        author: "Alex Kim",
        topic: "cs.AI",
      }),
    ).toBe('Search: "world models" · Category: cs.AI · Author name: Alex Kim');
  });
});
