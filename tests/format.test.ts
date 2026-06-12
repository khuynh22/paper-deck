import { test, expect } from "vitest";
import { fmtK, authorLine, dateLine, signalLine } from "@/lib/format";

test("fmtK keeps small numbers, abbreviates thousands", () => {
  expect(fmtK(312)).toBe("312");
  expect(fmtK(1900)).toBe("1.9k");
  expect(fmtK(151432)).toBe("151k");
});

test("authorLine truncates to three plus et al.", () => {
  expect(authorLine([])).toBe("Unknown authors");
  expect(authorLine(["A", "B"])).toBe("A, B");
  expect(authorLine(["A", "B", "C", "D"])).toBe("A, B, C et al.");
});

test("dateLine shows the full date for recent papers, year for old ones", () => {
  const now = new Date("2026-06-11T00:00:00Z");
  expect(dateLine("2026-06-10T00:00:00Z", now)).toBe("Jun 10, 2026");
  expect(dateLine("2017-06-12T00:00:00Z", now)).toBe("2017");
  expect(dateLine(null, now)).toBeNull();
  expect(dateLine("not-a-date", now)).toBeNull();
});

test("signalLine prefers citations, then upvotes, then stars, then 'new'", () => {
  expect(signalLine({ citations: 151432, hf_upvotes: 5, pwc_stars: 9 })).toBe("151k citations");
  expect(signalLine({ citations: 0, hf_upvotes: 12, pwc_stars: 9 })).toBe("▲ 12");
  expect(signalLine({ citations: 0, hf_upvotes: 0, pwc_stars: 1500 })).toBe("1.5k stars");
  expect(signalLine({ citations: 0, hf_upvotes: 0, pwc_stars: 0 })).toBe("new");
});
