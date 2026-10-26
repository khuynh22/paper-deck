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

test("duplicate zero signals remain supplied while absent signals stay absent", () => {
  const [paper] = dedupe([base({ arxivId: "a", signals: { citations: 0 } }), base({ arxivId: "a" })]);
  expect(paper.signals.citations).toBe(0);
  expect(paper.signals.hfUpvotes).toBeUndefined();
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
  expect(merged).toHaveLength(1);
  expect(merged[0].venue).toBe("ICML 2025");
});

test("matches a normalized DOI across DOI-only and arxiv records", () => {
  const merged = dedupe([
    base({ doi: " 10.TEST/Paper ", signals: { citations: 12 } }),
    base({ arxivId: "a", doi: "10.test/paper", authors: ["A", "B"] }),
  ]);
  expect(merged).toHaveLength(1);
  expect(merged[0]).toMatchObject({ arxivId: "a", doi: "10.test/paper", authors: ["A", "B"], signals: { citations: 12 } });
});

test("does not hide conflicting arxiv identities sharing a DOI", () => {
  expect(dedupe([
    base({ arxivId: "a", doi: "10.test/shared" }),
    base({ arxivId: "b", doi: "10.test/shared" }),
    base({ doi: "10.test/shared" }),
  ])).toHaveLength(3);
});

test("a DOI bridge merges previously separate compatible groups", () => {
  expect(dedupe([
    base({ arxivId: "a", signals: { hfUpvotes: 7 } }),
    base({ doi: "10.test/bridge", signals: { citations: 9 } }),
    base({ arxivId: "a", doi: "10.test/bridge" }),
  ])).toMatchObject([{ arxivId: "a", doi: "10.test/bridge", signals: { hfUpvotes: 7, citations: 9 } }]);
});

test("keeps full authors and a precise date when the preferred source is partial", () => {
  const [paper] = dedupe([
    base({ arxivId: "a", authors: ["A"], publishedAt: "2026-01-01T00:00:00Z" }),
    base({ arxivId: "a", authors: ["A", "B"], publishedAt: "2026-07-15T10:30:00Z" }),
  ]);
  expect(paper.authors).toEqual(["A", "B"]);
  expect(paper.publishedAt).toBe("2026-07-15T10:30:00Z");
});

test("blank titles do not collapse unrelated invalid records", () => {
  expect(dedupe([base({ title: "" }), base({ title: " " })])).toHaveLength(2);
});

test("different journal DOIs remain visible to database identity checks", () => {
  expect(dedupe([
    base({ arxivId: "a", doi: "10.test/first" }),
    base({ arxivId: "a", doi: "10.test/other-existing-paper" }),
  ])).toHaveLength(2);
});

test("blank optional fields cannot hide richer duplicate metadata", () => {
  const [paper] = dedupe([
    base({ arxivId: "a", abstract: "  ", authors: [" ", "  "], pdfUrl: " " }),
    base({ arxivId: "a", abstract: "Full abstract", authors: ["A"], pdfUrl: "https://example.test/p.pdf" }),
  ]);
  expect(paper).toMatchObject({ abstract: "Full abstract", authors: ["A"], pdfUrl: "https://example.test/p.pdf" });
});
