import { afterEach, expect, test, vi } from "vitest";
import { sourceFetch, sourceContext, sourceWarning, retryDelay } from "@/lib/sources/http";
import { runSources } from "@/lib/sources";
import { refreshStatus } from "@/lib/corpus/refresh";
import { isSourceStale } from "@/lib/corpus/refreshHealth";
import { fetchConferences } from "@/lib/sources/conferences";
import { fetchHfDaily } from "@/lib/sources/huggingface";
import { fetchS2Famous } from "@/lib/sources/semanticscholar";
import { fetchScholar } from "@/lib/sources/googlescholar";
import { fetchPwcTrending } from "@/lib/sources/paperswithcode";
import { fetchArxivLatest } from "@/lib/sources/arxiv";
import type { SourceId } from "@/lib/types";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test("a successful empty venue plus rate-limited venues is partial, not all failed", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response('{"data":[]}'))
    .mockImplementation(async () => new Response("", { status: 429, headers: { "retry-after": "120" } })));
  const result = await runSources([{ id: "conferences", run: () => fetchConferences("2024-2026") }]);
  expect(result.outcomes[0].status).toBe("partial");
  expect(result.outcomes[0].count).toBe(0);
  expect(result.errors.map(e => e.error)).toEqual(["ICML: Upstream HTTP 429", "ICLR: Upstream HTTP 429"]);
});

test("retries 429 using Retry-After, then returns the complete body", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "2" } }))
    .mockResolvedValueOnce(new Response("ok"));
  vi.stubGlobal("fetch", fetcher);
  const request = sourceFetch("https://example.test");
  await vi.advanceTimersByTimeAsync(1999);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await (await request).text()).toBe("ok");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test("a Retry-After exceeding the budget is reported without an early retry", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 429, headers: { "retry-after": "120" } }));
  vi.stubGlobal("fetch", fetcher);
  await expect(sourceFetch("https://example.test")).rejects.toThrow("HTTP 429");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("does not retry non-transient HTTP errors or expose URLs", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("secret", { status: 403 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(sourceFetch("https://example.test?api_key=private")).rejects.toThrow(/^Upstream HTTP 403$/);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test("body reads are aborted inside the source deadline", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => ({
    ok: true, status: 200, headers: new Headers(),
    arrayBuffer: () => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("abort")))),
  })));
  const request = sourceContext.run({ deadline: Date.now() + 1000, warnings: [] }, () => sourceFetch("https://example.test"));
  const result = expect(request).rejects.toThrow("timeout");
  await vi.advanceTimersByTimeAsync(1000);
  await result;
});

test("HTTP-date Retry-After is interpreted relative to the current clock", () => {
  expect(retryDelay("Thu, 01 Jan 1970 00:00:02 GMT", 1000)).toBe(1000);
});

test("mixed outcomes retain successes and sanitize failures", async () => {
  const result = await runSources([
    { id: "arxiv", run: async () => [] },
    { id: "conferences", run: async () => { sourceWarning("ICML", new Error("secret key")); return []; } },
  ]);
  expect(result.outcomes.map(s => s.status)).toEqual(["healthy", "failed"]);
  expect(result.errors).toEqual([{ id: "conferences", error: "ICML: Source failed" }]);
  expect(refreshStatus(result.outcomes, 0)).toBe("partial");
  expect(refreshStatus(result.outcomes.filter(s => s.status === "failed"), 0)).toBe("failed");
  expect(refreshStatus(result.outcomes.filter(s => s.status === "healthy"), 0)).toBe("healthy");
});

test("fresh empty fetches are healthy and freshness becomes stale after 26 hours", () => {
  expect(isSourceStale(null, 0)).toBe(true);
  expect(isSourceStale("1970-01-01T00:00:00Z", 0)).toBe(false);
  expect(isSourceStale("1970-01-01T00:00:00Z", 27 * 3600000)).toBe(true);
});

test("a hung source cannot hold the aggregate open indefinitely", async () => {
  vi.useFakeTimers();
  const request = runSources([{ id: "arxiv", run: () => new Promise(() => {}) }], Date.now() + 100);
  await vi.advanceTimersByTimeAsync(201);
  expect((await request).outcomes[0].status).toBe("failed");
});

const adapters: [SourceId, () => ReturnType<typeof fetchHfDaily>, string][] = [
  ["huggingface", fetchHfDaily, "[]"],
  ["semanticscholar", () => fetchS2Famous(["test"]), '{"data":[]}'],
  ["conferences", () => fetchConferences("2024-2026"), '{"data":[]}'],
  ["googlescholar", () => fetchScholar("test"), '{"organic_results":[]}'],
  ["paperswithcode", fetchPwcTrending, '{"results":[]}'],
  ["arxiv", fetchArxivLatest, '<feed xmlns="http://www.w3.org/2005/Atom"/>'],
];

test.each(adapters)("%s reports an HTTP 200 provider error as failed without exposing its contents", async (id, run) => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test");
  vi.stubEnv("SERPAPI_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":"api_key=private"}', { headers: { "content-type": "application/json" } })));
  const result = await runSources([{ id, run }]);
  expect(result.outcomes[0]).toMatchObject({ status: "failed", count: 0 });
  expect(result.errors.every(error => error.error.includes("Upstream format"))).toBe(true);
  expect(JSON.stringify(result)).not.toContain("private");
});

test.each(adapters)("%s accepts a valid empty response as healthy", async (id, run, body) => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test");
  vi.stubEnv("SERPAPI_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { headers: { "content-type": "application/json" } })));
  const result = await runSources([{ id, run }]);
  expect(result.outcomes[0]).toMatchObject({ status: "healthy", count: 0 });
  expect(result.errors).toEqual([]);
});

test.each(["{", "null", "{}", "[null]", '["invalid item"]'])("invalid HF payload %s cannot masquerade as a healthy empty response", async body => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
  const result = await runSources([{ id: "huggingface", run: fetchHfDaily }]);
  expect(result.outcomes[0].status).toBe("failed");
  expect(result.errors).toEqual([{ id: "huggingface", error: "Upstream format" }]);
});

test("malformed conference responses retain papers from a successful venue", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response('{"data":[{"title":"Paper","externalIds":{"ArXiv":"2611.12345"}}]}'))
    .mockImplementation(async () => new Response('{"error":"private provider detail"}')));
  const result = await runSources([{ id: "conferences", run: () => fetchConferences("2024-2026") }]);
  expect(result.results).toHaveLength(1);
  expect(result.outcomes[0]).toMatchObject({ status: "partial", count: 1 });
  expect(result.errors.map(error => error.error)).toEqual(["ICML: Upstream format", "ICLR: Upstream format"]);
});
