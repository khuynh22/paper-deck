import { test, expect } from "vitest";
import type { PaperRow } from "@/lib/types";
import { clampText, paperMetadata } from "@/lib/meta";

function paper(over: Partial<PaperRow> = {}): PaperRow {
  return {
    id: "p1",
    arxiv_id: "2401.00001",
    doi: null,
    title: "Attention Is All You Need",
    authors: ["Ashish Vaswani", "Noam Shazeer", "Niki Parmar", "Jakob Uszkoreit"],
    abstract: "The dominant sequence transduction models are based on complex recurrent networks.",
    categories: ["cs.CL", "cs.LG"],
    html_url: null,
    pdf_url: null,
    source_url: null,
    published_at: "2017-06-12T00:00:00Z",
    hf_upvotes: 0,
    pwc_stars: 0,
    citations: 120000,
    ...over,
  };
}

test("clampText passes short text through untouched", () => {
  expect(clampText("hello world", 200)).toBe("hello world");
});

test("clampText clips long text on a word boundary with an ellipsis", () => {
  const out = clampText("one two three four five six seven eight", 20);
  expect(out.endsWith("…")).toBe(true);
  expect(out.length).toBeLessThanOrEqual(21);
  expect(out).not.toMatch(/\s…$/); // trimmed before the ellipsis
});

test("clampText returns '' for null/blank", () => {
  expect(clampText(null)).toBe("");
  expect(clampText("   ")).toBe("");
});

test("paperMetadata sets title, canonical, article OG and large-image twitter card", () => {
  const m = paperMetadata(paper(), "https://ppdeck.com/paper/p1");
  expect(m.title).toBe("Attention Is All You Need");
  expect(m.alternates?.canonical).toBe("https://ppdeck.com/paper/p1");
  expect(m.openGraph).toMatchObject({ type: "article", url: "https://ppdeck.com/paper/p1" });
  expect((m.openGraph as { publishedTime?: string }).publishedTime).toBe("2017-06-12T00:00:00Z");
  expect(m.twitter).toMatchObject({ card: "summary_large_image" });
  expect(m.description).toContain("dominant sequence transduction");
});

test("paperMetadata falls back to the author line when there is no abstract", () => {
  const m = paperMetadata(paper({ abstract: null }), "https://ppdeck.com/paper/p1");
  expect(m.description).toBe("Ashish Vaswani, Noam Shazeer, Niki Parmar et al.");
});
