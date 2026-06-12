import { test, expect } from "vitest";
import { buildArxivSearchUrl, buildArxivIdUrl, extractArxivId } from "@/lib/sources/arxiv";

test("targets the all: field and sorts by relevance", () => {
  const url = buildArxivSearchUrl("transformers");
  expect(url).toContain("search_query=all:transformers");
  expect(url).toContain("sortBy=relevance");
  expect(url).toContain("sortOrder=descending");
});

test("multi-word queries search the phrase OR the AND of terms", () => {
  // A bare space would be read by arXiv as OR; the phrase branch finds pasted
  // titles, the parenthesized AND branch keeps topical queries broad.
  const url = buildArxivSearchUrl("diffusion models");
  expect(url).toContain(
    "search_query=all:%22diffusion+models%22+OR+%28all:diffusion+AND+all:models%29",
  );
});

test("strips stopwords from the AND branch (arXiv drops them, killing the conjunction)", () => {
  const url = buildArxivSearchUrl("Attention Is All You Need");
  // The phrase keeps every word…
  expect(url).toContain("all:%22Attention+Is+All+You+Need%22");
  // …but the AND branch must not contain `all:Is` (a stopword that matches nothing).
  expect(url).not.toMatch(/all:Is\b/);
  expect(url).toContain("all:Attention+AND+all:All+AND+all:You+AND+all:Need");
});

test("keeps the original terms when the query is all stopwords", () => {
  expect(buildArxivSearchUrl("to be")).toContain("all:%22to+be%22");
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

test("extractArxivId recognizes bare ids, arXiv: refs, and versions", () => {
  expect(extractArxivId("1706.03762")).toBe("1706.03762");
  expect(extractArxivId("1706.03762v5")).toBe("1706.03762");
  expect(extractArxivId("arXiv:1706.03762")).toBe("1706.03762");
  expect(extractArxivId("math/0211159")).toBe("math/0211159");
});

test("extractArxivId recognizes abs/pdf/html URLs", () => {
  expect(extractArxivId("https://arxiv.org/abs/1706.03762")).toBe("1706.03762");
  expect(extractArxivId("https://arxiv.org/abs/1706.03762v5")).toBe("1706.03762");
  expect(extractArxivId("https://arxiv.org/pdf/1706.03762.pdf")).toBe("1706.03762");
  expect(extractArxivId("https://arxiv.org/html/2506.08421v1")).toBe("2506.08421");
  expect(extractArxivId("http://www.arxiv.org/abs/1706.03762?context=cs")).toBe("1706.03762");
});

test("extractArxivId returns null for ordinary search text", () => {
  expect(extractArxivId("attention is all you need")).toBeNull();
  expect(extractArxivId("transformers 2017")).toBeNull();
  expect(extractArxivId("")).toBeNull();
  expect(extractArxivId("https://example.com/abs/1706.03762")).toBeNull();
});

test("buildArxivIdUrl fetches exactly that id", () => {
  expect(buildArxivIdUrl("1706.03762")).toBe(
    "https://export.arxiv.org/api/query?id_list=1706.03762&max_results=1",
  );
  expect(buildArxivIdUrl("math/0211159")).toContain("id_list=math%2F0211159");
});
