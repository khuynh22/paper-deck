import { test, expect } from "vitest";
import { parseSerpScholar } from "@/lib/sources/googlescholar";

const json = {
  organic_results: [
    {
      title: "Deep Residual Learning for Image Recognition",
      link: "https://arxiv.org/abs/1512.03385",
      publication_info: { summary: "K He, X Zhang, S Ren - CVPR, 2016 - openaccess.thecvf.com" },
      inline_links: { cited_by: { total: 200000 } },
    },
    {
      title: "Some Journal Paper",
      link: "https://example.com/paper",
      publication_info: { summary: "A Author - Nature, 2019 - nature.com" },
      inline_links: { cited_by: { total: 42 } },
    },
  ],
};

test("parses arxiv id, citations, authors, and year", () => {
  const [p] = parseSerpScholar(json);
  expect(p.arxivId).toBe("1512.03385");
  expect(p.signals.citations).toBe(200000);
  expect(p.authors).toEqual(["K He", "X Zhang", "S Ren"]);
  expect(p.publishedAt).toBe("2016-01-01T00:00:00Z");
});

test("non-arxiv links keep null arxivId but retain sourceUrl + citations", () => {
  const [, second] = parseSerpScholar(json);
  expect(second.arxivId).toBeNull();
  expect(second.sourceUrl).toBe("https://example.com/paper");
  expect(second.signals.citations).toBe(42);
});

test("returns empty for malformed input", () => {
  expect(parseSerpScholar({})).toEqual([]);
});
