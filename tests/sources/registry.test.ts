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

test("source priority follows registry order even when the first source finishes last", async () => {
  let finish!: (papers: NormalizedPaper[]) => void;
  const slow = new Promise<NormalizedPaper[]>(resolve => { finish = resolve; });
  const pending = runSources([
    { id: "arxiv", run: () => slow },
    { id: "huggingface", run: async () => [fake("second")] },
  ]);
  await Promise.resolve();
  finish([fake("first")]);
  expect((await pending).results.map(p => p.arxivId)).toEqual(["first", "second"]);
});
