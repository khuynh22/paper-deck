import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseS2 } from "@/lib/sources/semanticscholar";

const json = JSON.parse(readFileSync("tests/fixtures/s2-search.json", "utf8"));

test("extracts arxiv id and citation count", () => {
  const [p] = parseS2(json);
  expect(p.arxivId).toBe("1706.03762");
  expect(p.signals.citations).toBe(130000);
  expect(p.title).toBe("Attention Is All You Need");
});

test("handles DOI-only papers with no arxiv id", () => {
  const [, second] = parseS2(json);
  expect(second.arxivId).toBeNull();
  expect(second.doi).toBe("10.1109/xyz");
  expect(second.sourceUrl).toBe("https://doi.org/10.1109/xyz");
  expect(second.publishedAt).toBe("2015-01-01T00:00:00Z");
});

test("returns empty for malformed input", () => {
  expect(parseS2({})).toEqual([]);
  expect(parseS2(null)).toEqual([]);
});
