import { test, expect } from "vitest";
import { runSources } from "@/lib/sources";
import type { NormalizedPaper } from "@/lib/types";

const fake = (arxivId: string): NormalizedPaper => ({
  arxivId,
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
});

test("collects results from all sources", async () => {
  const { results, errors } = await runSources([
    { id: "arxiv", run: async () => [fake("1"), fake("2")] },
    { id: "huggingface", run: async () => [fake("3")] },
  ]);
  expect(results).toHaveLength(3);
  expect(errors).toHaveLength(0);
});

test("a throwing source is isolated and reported, others still return", async () => {
  const { results, errors } = await runSources([
    { id: "arxiv", run: async () => [fake("1")] },
    {
      id: "semanticscholar",
      run: async () => {
        throw new Error("boom");
      },
    },
  ]);
  expect(results).toHaveLength(1);
  expect(errors).toEqual([{ id: "semanticscholar", error: "boom" }]);
});
