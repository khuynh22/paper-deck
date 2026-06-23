import { test, expect, vi, beforeEach } from "vitest";
import type { User } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => {
  // select(...).eq(...).eq(...).order(...) -> { data, error }
  const order = vi.fn(async () => ({ data: [] as unknown[], error: null }));
  const selectEq2 = vi.fn(() => ({ order }));
  const selectEq1 = vi.fn(() => ({ eq: selectEq2 }));
  const select = vi.fn(() => ({ eq: selectEq1 }));
  // insert(...).select(...).single() -> { data, error }
  const single = vi.fn(async () => ({ data: null as unknown, error: null as unknown }));
  const insertSelect = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select: insertSelect }));
  // update(...).eq(...).eq(...) -> { error }
  const updateEq2 = vi.fn(async () => ({ error: null }));
  const updateEq1 = vi.fn(() => ({ eq: updateEq2 }));
  const update = vi.fn(() => ({ eq: updateEq1 }));
  // delete().eq(...).eq(...) -> { error }
  const deleteEq2 = vi.fn(async () => ({ error: null }));
  const deleteEq1 = vi.fn(() => ({ eq: deleteEq2 }));
  const del = vi.fn(() => ({ eq: deleteEq1 }));

  const from = vi.fn(() => ({ select, insert, update, delete: del }));
  return {
    order,
    single,
    insert,
    insertSelect,
    update,
    updateEq2,
    del,
    deleteEq2,
    from,
    currentUser: vi.fn(async (): Promise<User | null> => null),
  };
});

vi.mock("@/lib/auth", () => ({ currentUser: mocks.currentUser }));
vi.mock("@/lib/db/server", () => ({ serverClient: async () => ({ from: mocks.from }) }));

import { loadHighlights, createHighlight, deleteHighlight } from "@/app/actions/highlights";

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

test("createHighlight returns null and skips insert on invalid input", async () => {
  const result = await createHighlight({
    paperId: "p1",
    blockAnchor: "2",
    startOffset: 5,
    endOffset: 5, // end <= start
    quote: "x",
  });
  expect(result).toBeNull();
  expect(mocks.insert).not.toHaveBeenCalled();
});

test("createHighlight inserts and returns the mapped row on success", async () => {
  mocks.single.mockResolvedValue({
    data: {
      id: "h9",
      paper_id: "p1",
      block_anchor: "2",
      start_offset: 0,
      end_offset: 4,
      quote: "test",
      note: null,
    },
    error: null,
  });
  const result = await createHighlight({
    paperId: "p1",
    blockAnchor: "2",
    startOffset: 0,
    endOffset: 4,
    quote: "test",
  });
  expect(result).toEqual({
    id: "h9",
    paperId: "p1",
    blockAnchor: "2",
    startOffset: 0,
    endOffset: 4,
    quote: "test",
    note: null,
  });
  expect(mocks.insert).toHaveBeenCalledWith({
    user_id: "user-1",
    paper_id: "p1",
    block_anchor: "2",
    start_offset: 0,
    end_offset: 4,
    quote: "test",
    note: null,
  });
});

test("deleteHighlight is a no-op when signed out", async () => {
  mocks.currentUser.mockResolvedValue(null);
  await deleteHighlight("h1");
  expect(mocks.from).not.toHaveBeenCalled();
});
