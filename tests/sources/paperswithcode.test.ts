import { test, expect } from "vitest";
import { parsePwc } from "@/lib/sources/paperswithcode";

test("maps results with arxiv id and stars signal", () => {
  const out = parsePwc({
    results: [
      {
        arxiv_id: "2401.999",
        title: "A Paper",
        authors: ["X Y"],
        abstract: "abs",
        published: "2024-01-01",
        stars: 1200,
      },
    ],
  });
  expect(out).toHaveLength(1);
  expect(out[0].arxivId).toBe("2401.999");
  expect(out[0].signals.pwcStars).toBe(1200);
  expect(out[0].pdfUrl).toBe("https://arxiv.org/pdf/2401.999");
});

test("returns empty for HTML/non-json (retired API)", () => {
  expect(parsePwc("<!doctype html>")).toEqual([]);
  expect(parsePwc({})).toEqual([]);
  expect(parsePwc(null)).toEqual([]);
});
