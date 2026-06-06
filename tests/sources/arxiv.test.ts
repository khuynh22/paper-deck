import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseArxivAtom } from "@/lib/sources/arxiv";

const xml = readFileSync("tests/fixtures/arxiv.atom.xml", "utf8");

test("parses both entries", () => {
  expect(parseArxivAtom(xml)).toHaveLength(2);
});

test("strips the version suffix from the arxiv id", () => {
  const [p] = parseArxivAtom(xml);
  expect(p.arxivId).toBe("2401.12345");
});

test("builds html, pdf, and source urls", () => {
  const [p] = parseArxivAtom(xml);
  expect(p.htmlUrl).toBe("https://arxiv.org/html/2401.12345");
  expect(p.pdfUrl).toBe("https://arxiv.org/pdf/2401.12345");
  expect(p.sourceUrl).toBe("https://arxiv.org/abs/2401.12345");
});

test("extracts authors, categories, doi, and normalizes title whitespace", () => {
  const [p] = parseArxivAtom(xml);
  expect(p.authors).toEqual(["Ada Lovelace", "Alan Turing"]);
  expect(p.categories).toContain("cs.LG");
  expect(p.categories).toContain("cs.AI");
  expect(p.doi).toBe("10.1234/example.2401.12345");
  expect(p.title).toBe("Scaling Laws for Efficient Transformers");
});

test("handles single-author entry and trims abstract", () => {
  const [, second] = parseArxivAtom(xml);
  expect(second.authors).toEqual(["Grace Hopper"]);
  expect(second.abstract).toBe("A fresh look at denoising diffusion probabilistic models.");
  expect(second.publishedAt).toBe("2024-02-01T10:00:00Z");
});
