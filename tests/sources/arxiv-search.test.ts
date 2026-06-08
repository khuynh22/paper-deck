import { test, expect } from "vitest";
import { buildArxivSearchUrl } from "@/lib/sources/arxiv";

test("targets the all: field and sorts by relevance", () => {
  const url = buildArxivSearchUrl("transformers");
  expect(url).toContain("search_query=all:transformers");
  expect(url).toContain("sortBy=relevance");
  expect(url).toContain("sortOrder=descending");
});

test("joins multi-word queries with AND so all terms must match", () => {
  // A bare space would be read by arXiv as OR; we AND-join instead.
  const url = buildArxivSearchUrl("diffusion models");
  expect(url).toContain("search_query=all:diffusion+AND+all:models");
});

test("url-encodes special characters per term and leaks no raw spaces", () => {
  const url = buildArxivSearchUrl("text-to-image & GANs");
  expect(url).toContain("all:text-to-image");
  expect(url).toContain("all:%26"); // & encoded
  expect(url).toContain("all:GANs");
  expect(url).not.toMatch(/ /);
});

test("trims surrounding whitespace, leaving a single term", () => {
  expect(buildArxivSearchUrl("  attention  ")).toContain("search_query=all:attention&");
});

test("honors the max_results argument", () => {
  expect(buildArxivSearchUrl("rlhf", 7)).toContain("max_results=7");
  expect(buildArxivSearchUrl("rlhf")).toContain("max_results=25"); // default
});
