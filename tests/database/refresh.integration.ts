import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
const { aggregate } = vi.hoisted(() => ({ aggregate: vi.fn() }));
vi.mock("@/lib/sources", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/sources")>(), aggregate,
}));
import { runRefresh } from "@/lib/corpus/refresh";
import { runSources } from "@/lib/sources";
import { fetchHfDaily } from "@/lib/sources/huggingface";
import type { NormalizedPaper } from "@/lib/types";

const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
beforeEach(() => { aggregate.mockReset(); });
afterEach(() => vi.unstubAllGlobals());

test("partial refresh retains committed counts and unconfirmed batches through real HTTP", async () => {
  const papers = Array.from({ length: 201 }, (_, i): NormalizedPaper => ({
    arxivId: `refresh-http-${i}`, doi: null, title: `Refresh paper ${i}`, authors: [],
    abstract: null, categories: [], htmlUrl: null, pdfUrl: null, sourceUrl: null, publishedAt: null, signals: {},
  }));
  aggregate.mockResolvedValue({ results: papers, errors: [], outcomes: [{ id: "arxiv", status: "healthy", count: papers.length, errors: [] }] });
  const realFetch = globalThis.fetch;
  let batches = 0;
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/rpc/merge_papers") && ++batches === 2) {
      return Promise.resolve(new Response('{"message":"private upstream detail"}', { status: 503 }));
    }
    return realFetch(input, init);
  }));
  const result = await runRefresh("cron");
  expect(result.status).toBe("partial");
  expect(result.ingestion).toEqual({ inserted: 101, updated: 0, skipped: 0, failed: 0, unconfirmed: 100 });
  const saved = await service.from("refresh_runs").select("status,ingestion,error").eq("id", result.runId!).single();
  expect(saved.error).toBeNull();
  expect(saved.data).toMatchObject({ status: "partial", ingestion: result.ingestion });
  expect(JSON.stringify(saved.data)).not.toContain("private");
  const persisted = await service.from("papers").select("id", { count: "exact", head: true }).like("arxiv_id", "refresh-http-%");
  expect(persisted.error).toBeNull();
  expect(persisted.count).toBe(101);
});

test("a malformed provider response cannot advance durable source freshness", async () => {
  const realFetch = globalThis.fetch;
  let body = "[]";
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    return url.startsWith("https://huggingface.co/") ? Promise.resolve(new Response(body)) : realFetch(input, init);
  }));
  aggregate.mockImplementation(() => runSources([{ id: "huggingface", run: fetchHfDaily }]));
  expect((await runRefresh("cron")).status).toBe("healthy");
  const oldSuccess = "2000-01-01T00:00:00+00:00";
  const reset = await service.from("refresh_source_health").update({ last_success_at: oldSuccess }).eq("source_id", "huggingface");
  expect(reset.error).toBeNull();
  body = '{"error":"private provider details"}';
  const result = await runRefresh("cron");
  expect(result.status).toBe("failed");
  expect(result.errors).toEqual([{ id: "huggingface", error: "Upstream format" }]);
  const health = await service.from("refresh_source_health").select("last_success_at,last_outcome").eq("source_id", "huggingface").single();
  expect(health.error).toBeNull();
  expect(health.data).toMatchObject({ last_success_at: oldSuccess, last_outcome: { status: "failed", count: 0 } });
});

test("anonymous HTTP clients cannot read history or claim a refresh", async () => {
  const history = await anon.from("refresh_runs").select("*");
  expect(history.error?.code).toBe("42501");
  const claim = await anon.rpc("begin_refresh", { kind: "manual" });
  expect(claim.error?.code).toBe("42501");
});
