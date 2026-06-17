import { test, expect } from "vitest";
import { dedupe, dedupeKey } from "@/lib/corpus/dedupe";
import type { NormalizedPaper } from "@/lib/types";

const base = (o: Partial<NormalizedPaper>): NormalizedPaper => ({
  arxivId: null,
  doi: null,
  title: "T",
  authors: [],
  abstract: null,
  categories: [],
  htmlUrl: null,
  pdfUrl: null,
  sourceUrl: null,
  publishedAt: null,
  signals: {},
  ...o,
});

test("same arxiv id merges into one and keeps each source's signal", () => {
  const merged = dedupe([
    base({ arxivId: "2401.1", signals: { hfUpvotes: 10 } }),
    base({ arxivId: "2401.1", signals: { citations: 5 } }),
  ]);
  expect(merged).toHaveLength(1);
  expect(merged[0].signals.hfUpvotes).toBe(10);
  expect(merged[0].signals.citations).toBe(5);
});

test("merge fills missing metadata from the duplicate", () => {
  const merged = dedupe([
    base({ arxivId: "2401.2", abstract: null, categories: ["cs.LG"] }),
    base({ arxivId: "2401.2", abstract: "filled", categories: ["cs.AI"] }),
  ]);
  expect(merged[0].abstract).toBe("filled");
  expect(merged[0].categories.sort()).toEqual(["cs.AI", "cs.LG"]);
});

test("keeps the larger of duplicate signals", () => {
  const merged = dedupe([
    base({ arxivId: "2401.3", signals: { citations: 100 } }),
    base({ arxivId: "2401.3", signals: { citations: 250 } }),
  ]);
  expect(merged[0].signals.citations).toBe(250);
});

test("dedupeKey falls back arxiv -> doi -> normalized title", () => {
  expect(dedupeKey(base({ arxivId: "2401.4" }))).toBe("arxiv:2401.4");
  expect(dedupeKey(base({ doi: "10.1/x" }))).toBe("doi:10.1/x");
  expect(dedupeKey(base({ title: "Attention  Is All You Need" }))).toBe(
    "title:attention is all you need",
  );
});

test("distinct papers are preserved", () => {
  expect(dedupe([base({ arxivId: "a" }), base({ arxivId: "b" })])).toHaveLength(2);
});

test("an arxiv row inherits a conference venue when merged", () => {
  const merged = dedupe([
    base({ arxivId: "2401.9" }),
    base({ arxivId: "2401.9", venue: "NeurIPS 2024" }),
  ]);
  expect(merged).toHaveLength(1);
  expect(merged[0].venue).toBe("NeurIPS 2024");
});

test("venue survives regardless of merge order", () => {
  const merged = dedupe([
    base({ arxivId: "2401.10", venue: "ICML 2025" }),
    base({ arxivId: "2401.10" }),
  ]);
  expect(merged[0].venue).toBe("ICML 2025");
});
