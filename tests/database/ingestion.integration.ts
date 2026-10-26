import { expect, test } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { upsertPapers } from "@/lib/corpus/upsert";
import type { NormalizedPaper } from "@/lib/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const paper = (overrides: Partial<NormalizedPaper>): NormalizedPaper => ({
  arxivId: null, doi: null, title: "HTTP paper", authors: [], abstract: null,
  categories: [], htmlUrl: null, pdfUrl: null, sourceUrl: null, publishedAt: null, signals: {}, ...overrides,
});

test("real HTTP imports preserve enriched metadata and explicit zero through the app caller", async () => {
  expect(await upsertPapers([paper({ arxivId: "http-rich", doi: "10.test/http-rich", authors: ["A", "B"], venue: "Conference", publishedAt: "2026-07-15T10:30:00Z", signals: { citations: 12, hfUpvotes: 3, pwcStars: 2 } })]))
    .toEqual({ inserted: 1, updated: 0, skipped: 0, failed: 0, unconfirmed: 0 });
  expect(await upsertPapers([paper({ arxivId: "http-rich", authors: ["A"], publishedAt: "2026-01-01T00:00:00Z" })]))
    .toEqual({ inserted: 0, updated: 0, skipped: 1, failed: 0, unconfirmed: 0 });
  expect(await upsertPapers([paper({ arxivId: "http-rich", signals: { citations: 0, hfUpvotes: 0, pwcStars: 0 } })]))
    .toEqual({ inserted: 0, updated: 1, skipped: 0, failed: 0, unconfirmed: 0 });
  const { data, error } = await service.from("papers").select("doi,authors,published_at,venue,citations,hf_upvotes,pwc_stars").eq("arxiv_id", "http-rich").single();
  expect(error).toBeNull();
  expect(data).toEqual({ doi: "10.test/http-rich", authors: ["A", "B"], published_at: "2026-07-15T10:30:00+00:00", venue: "Conference", citations: 0, hf_upvotes: 0, pwc_stars: 0 });
});

test("real HTTP mixed outcomes match persisted rows and deduplicate the run", async () => {
  expect(await upsertPapers([
    paper({ doi: " 10.TEST/Http-Mixed ", signals: { citations: 20 } }),
    paper({ doi: "10.test/http-mixed", signals: { citations: 5 } }),
    paper({ doi: "10.test/http-invalid", title: "" }),
  ])).toEqual({ inserted: 1, updated: 0, skipped: 0, failed: 1, unconfirmed: 0 });
  const { data, error } = await service.from("papers").select("doi,citations").in("doi", ["10.test/http-mixed", "10.test/http-invalid"]);
  expect(error).toBeNull();
  expect(data).toEqual([{ doi: "10.test/http-mixed", citations: 20 }]);
});

test("the real HTTP endpoint denies anonymous imports", async () => {
  const { error } = await anon.rpc("merge_papers", { incoming: [{ title: "Denied", doi: "10.test/http-denied" }] });
  expect(error?.code).toBe("42501");
  const { count, error: readError } = await service.from("papers").select("id", { count: "exact", head: true }).eq("doi", "10.test/http-denied");
  expect(readError).toBeNull();
  expect(count).toBe(0);
});

test("the real HTTP endpoint enforces the SQL batch bound", async () => {
  const { error } = await service.rpc("merge_papers", { incoming: Array.from({ length: 101 }, () => ({ title: "Too many" })) });
  expect(error?.message).toContain("at most 100");
});
