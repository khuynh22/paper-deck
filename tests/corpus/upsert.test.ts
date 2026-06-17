import { test, expect } from "vitest";
import { toPaperRow } from "@/lib/corpus/upsert";
import type { NormalizedPaper } from "@/lib/types";

const base = (o: Partial<NormalizedPaper>): NormalizedPaper => ({
  arxivId: "2401.1",
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

test("maps a venue when present", () => {
  expect(toPaperRow(base({ venue: "NeurIPS 2024" })).venue).toBe("NeurIPS 2024");
});

test("maps a missing venue to null", () => {
  expect(toPaperRow(base({})).venue).toBeNull();
});
