import { test, expect, vi, beforeEach } from "vitest";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/server", () => ({ serverClient: async () => ({ rpc }) }));
import { getFeed } from "@/lib/corpus/query";
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
