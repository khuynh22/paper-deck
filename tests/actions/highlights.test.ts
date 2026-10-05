import { test, expect, vi, beforeEach } from "vitest";
import type { User } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => {
  // select(...).eq(...).eq(...).order(...) -> { data, error }
  const order = vi.fn(async () => ({ data: [] as unknown[], error: null }));
  const chain = { order: vi.fn(() => chain), range: order };
  const selectEq2 = vi.fn(() => chain);
  const selectEq1 = vi.fn(() => ({ eq: selectEq2 }));
  const select = vi.fn(() => ({ eq: selectEq1 }));
  const from = vi.fn(() => ({ select }));
  return {
    order,
    from,
    currentUser: vi.fn(async (): Promise<User | null> => null),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ currentUser: mocks.currentUser }));
vi.mock("@/lib/db/server", () => ({
  serverClient: async () => ({ from: mocks.from }),
}));

import { loadHighlights } from "@/app/actions/highlights";

const USER = { id: "user-1" } as User;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentUser.mockResolvedValue(USER);
});

test("loadHighlights returns [] and skips the DB when signed out", async () => {
  mocks.currentUser.mockResolvedValue(null);
  expect(await loadHighlights("p1")).toEqual([]);
  expect(mocks.from).not.toHaveBeenCalled();
});

test("loadHighlights maps returned rows to the app shape", async () => {
  mocks.order.mockResolvedValue({
    data: [
      {
        id: "h1",
        paper_id: "p1",
        block_anchor: "2",
        start_offset: 0,
        end_offset: 4,
        quote: "test",
        note: null,
      },
    ],
    error: null,
  });
  const result = await loadHighlights("p1");
  expect(result).toEqual([
    {
      id: "h1",
      paperId: "p1",
      blockAnchor: "2",
      startOffset: 0,
      endOffset: 4,
      quote: "test",
      note: null,
    },
  ]);
});

test("loadHighlights fetches beyond the default thousand row limit", async () => {
  const row = {
    id: "h1",
    paper_id: "p1",
    block_anchor: "0",
    start_offset: 0,
    end_offset: 4,
    quote: "test",
    note: null,
  };
  mocks.order
    .mockResolvedValueOnce({
      data: Array.from({ length: 1000 }, () => row),
      error: null,
    })
    .mockResolvedValueOnce({ data: [{ ...row, id: "last" }], error: null });
  const rows = await loadHighlights("p1");
  expect(rows).toHaveLength(1001);
  expect(rows.at(-1)?.id).toBe("last");
  expect(mocks.order).toHaveBeenNthCalledWith(2, 1000, 1999);
});
test("loadHighlights surfaces failures rather than describing notes as missing", async () => {
  mocks.order.mockRejectedValueOnce(new Error("database unavailable"));
  await expect(loadHighlights("p1")).rejects.toThrow("database unavailable");
});
