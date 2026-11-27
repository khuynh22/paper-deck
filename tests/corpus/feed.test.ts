import { test, expect, vi, beforeEach } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/server", () => ({ serverClient: async () => ({ rpc }) }));
import { getFeed, getDiscoveryPage } from "@/lib/corpus/query";
import { parseDiscovery } from "@/lib/corpus/discovery";
beforeEach(() => rpc.mockReset());
test("trending delegates ranking and its frozen paging window to SQL", async () => {
  const rows = [{ id: "fresh-below-raw-top-40" }];
  rpc.mockResolvedValue({ data: rows, error: null });
  expect(await getFeed("trending", 20, { asOf: "2026-06-06T00:00:00Z", offset: 40 })).toEqual(rows);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("trending_papers", { as_of: "2026-06-06T00:00:00Z", page_limit: 20, page_offset: 40 });
});
test("database ranking errors are not disguised as an empty feed", async () => {
  rpc.mockResolvedValue({ data: null, error: new Error("unavailable") });
  await expect(getFeed("trending")).rejects.toThrow("unavailable");
});
test("invalid paging windows are rejected before querying", async () => {
  await expect(getFeed("trending", 101)).rejects.toThrow("Invalid feed window");
  await expect(getFeed("trending", 40, { offset: -1 })).rejects.toThrow("Invalid feed window");
  await expect(getFeed("trending", 40, { asOf: "invalid" })).rejects.toThrow("Invalid feed window");
  expect(rpc).not.toHaveBeenCalled();
});

test("discovery requests an extra row and returns displayed rows separately from hasMore", async () => {
  rpc.mockResolvedValue({ data: Array.from({ length: 41 }, (_, id) => ({ id: String(id) })), error: null });
  const params = parseDiscovery({ q: "diffusion", topic: "cs.AI", venue: "TestConf", from: "2026-01-01", page: "2", asof: "2026-06-06T00:00:00Z" });
  const result = await getDiscoveryPage(params, true);
  expect(result.papers).toHaveLength(40); expect(result.hasMore).toBe(true);
  expect(rpc).toHaveBeenCalledWith("discover_papers", expect.objectContaining({ query_text: "diffusion", sort_mode: "search", filter_topic: "cs.AI", filter_venue: "TestConf", filter_from: "2026-01-01", page_offset: 40, page_limit: 41 }));
});

test("exact arXiv lookup still uses server-side discovery filters", async () => {
  rpc.mockResolvedValue({ data: [], error: null });
  await getDiscoveryPage(parseDiscovery({ q: "https://arxiv.org/abs/2401.12345", topic: "cs.AI" }), true);
  expect(rpc).toHaveBeenCalledWith("discover_papers", expect.objectContaining({ exact_arxiv: "2401.12345", filter_topic: "cs.AI" }));
});
