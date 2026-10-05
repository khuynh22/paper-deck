import { test, expect } from "vitest";
import { parse } from "@retorquere/bibtex-parser";
import {
  bibtex,
  markdown,
  filename,
  canonicalUrl,
} from "@/lib/exports/serialize";
import { passageVerifier } from "@/lib/exports/passage";
import { collectPages } from "@/lib/exports/collect";
import type { PaperRow, Highlight } from "@/lib/types";
const origin = "https://paper.example";
const paper: PaperRow = {
  id: "10000000-0000-4000-8000-000000000001",
  title: "Unicode Étude: {AI} & 100% $x_1$ \\input{evil} # ~ ^",
  authors: ["Zoë 李", "Research and Development {Group}"],
  arxiv_id: null,
  doi: null,
  abstract: null,
  categories: [],
  html_url: null,
  pdf_url: null,
  source_url: null,
  published_at: null,
  hf_upvotes: 0,
  pwc_stars: 0,
  citations: 0,
};
const highlight: Highlight = {
  id: "20000000-0000-4000-8000-000000000001",
  paperId: paper.id,
  blockAnchor: "8",
  startOffset: 0,
  endOffset: 3,
  quote: "A&B",
  note: "<script>alert(1)</script>\n```\nOriginal *note*",
};
test("BibTeX parses escaped Unicode and special characters without fake fields", () => {
  const result = parse(bibtex([paper], origin));
  expect(result.errors).toEqual([]);
  expect(result.entries).toHaveLength(1);
  expect(result.entries[0].fields.title.toLowerCase()).toContain("étude");
  expect(bibtex([paper], origin)).toContain("Étude");
  expect(result.entries[0].fields).not.toHaveProperty("year");
  expect(result.entries[0].fields).not.toHaveProperty("doi");
  expect(result.entries[0].fields).not.toHaveProperty("howpublished");
  expect(result.entries[0].fields.author).toHaveLength(2);
  expect(result.preamble).toEqual([]);
});
test("keys remain unique for identical metadata and stable when metadata improves", () => {
  const second = { ...paper, id: "10000000-0000-4000-8000-000000000002" };
  const original = parse(bibtex([paper, second, paper], origin));
  expect(original.errors).toEqual([]);
  expect(new Set(original.entries.map((e) => e.key)).size).toBe(2);
  const improved = parse(
    bibtex(
      [
        {
          ...paper,
          title: "Improved",
          published_at: "2026-02-01",
          venue: "A&B",
          doi: "10.1/test",
        },
      ],
      origin,
    ),
  );
  expect(improved.entries[0].key).toBe(original.entries[0].key);
  expect(improved.entries[0].fields.year).toBe("2026");
});
test("Markdown preserves literal hostile content and attribution, with links only for verified passages", () => {
  const output = markdown([paper], [{ highlight, passageValid: true }], origin);
  expect(output).toContain(highlight.note);
  expect(output).toContain(highlight.quote);
  expect(output).toContain("````text\n<script>");
  expect(output).toContain(`?highlight=${highlight.id}`);
  expect(
    markdown([paper], [{ highlight, passageValid: false }], origin),
  ).not.toContain("?highlight=");
  expect(
    canonicalUrl({ ...paper, source_url: "javascript:alert(1)" }, origin),
  ).toBe(`${origin}/paper/${paper.id}`);
  expect(filename('../../bad\r\n"name', "bib")).toMatch(/^[\w-]+\.bib$/);
});
test("exported passage validation decodes entities and rejects drift", () => {
  const valid = passageVerifier('<p data-blk="8">A&amp;<em>B</em></p>');
  expect(valid(highlight)).toBe(true);
  expect(valid({ ...highlight, quote: "old" })).toBe(false);
  expect(passageVerifier(null)(highlight)).toBe(false);
});
test("bulk collection passes 1000 records and fails instead of returning partial results", async () => {
  const rows = Array.from({ length: 2005 }, (_, i) => ({
    id: String(i + 1).padStart(5, "0"),
  }));
  const result = await collectPages(
    async (after) => ({
      data: rows.filter((r) => !after || r.id > after).slice(0, 1000),
      error: null,
    }),
    (r) => r.id,
  );
  expect(result).toEqual(rows);
  await expect(
    collectPages(
      async (after) =>
        after
          ? { data: null, error: new Error("page failed") }
          : { data: rows.slice(0, 1000), error: null },
      (r) => r.id,
    ),
  ).rejects.toThrow("page failed");
});
