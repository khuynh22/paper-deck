import { test, expect } from "vitest";
import { labelConference } from "@/lib/sources/conferences";
import type { NormalizedPaper } from "@/lib/types";

const paper = (publishedAt: string | null): NormalizedPaper => ({
  arxivId: "2401.1",
  doi: null,
  title: "T",
  authors: [],
  abstract: null,
  categories: [],
  htmlUrl: null,
  pdfUrl: null,
  sourceUrl: null,
  publishedAt,
  signals: { citations: 5 },
});

test("stamps a short venue label with the publication year", () => {
  const [p] = labelConference([paper("2024-01-01T00:00:00Z")], "NeurIPS");
  expect(p.venue).toBe("NeurIPS 2024");
});

test("falls back to the bare label when the year is unknown", () => {
  const [p] = labelConference([paper(null)], "ICLR");
  expect(p.venue).toBe("ICLR");
});

test("leaves the other fields intact", () => {
  const [p] = labelConference([paper("2025-01-01T00:00:00Z")], "ICML");
  expect(p.arxivId).toBe("2401.1");
  expect(p.signals.citations).toBe(5);
});
