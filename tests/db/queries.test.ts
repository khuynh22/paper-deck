import { test, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const eq = vi.fn(
    async (): Promise<{ data: { paper_id: string }[] | null; error: { message: string } | null }> => ({
      data: [],
      error: null,
    }),
  );
  const select = vi.fn(() => ({ eq }));
  const inPapers = vi.fn();
  const limit = vi.fn();
  const progressQuery = {
    eq: vi.fn().mockReturnThis(),
    in: inPapers,
    order: vi.fn().mockReturnThis(),
    limit,
  };
  const from = vi.fn((table: string) => table === "reading_progress"
    ? { select: vi.fn(() => progressQuery) }
    : { select });
  return { eq, from, inPapers, limit };
});
vi.mock("@/lib/db/server", () => ({ serverClient: async () => ({ from: mocks.from }) }));

import { getContinueReading, getProgressMap, getStarredIds } from "@/lib/db/queries";

beforeEach(() => {
  vi.clearAllMocks();
});

test("getStarredIds returns the set of starred paper ids", async () => {
  mocks.eq.mockResolvedValue({ data: [{ paper_id: "a" }, { paper_id: "b" }], error: null });
  const ids = await getStarredIds("user-1");
  expect(ids).toEqual(new Set(["a", "b"]));
});

test("getStarredIds throws when the query fails instead of returning an empty set", async () => {
  mocks.eq.mockResolvedValue({ data: null, error: { message: "connection refused" } });
  await expect(getStarredIds("user-1")).rejects.toThrow(/stars query failed/);
});

test("feed progress uses the saved reading position when read depth differs", async () => {
  mocks.inPapers.mockResolvedValue({
    data: [{ paper_id: "p1", scroll_pct: 0.06, read_pct: 0.55 }],
    error: null,
  });
  expect(await getProgressMap("user-1", ["p1"])).toEqual(new Map([["p1", 0.06]]));
});

test("Continue Reading shows the position it will resume from", async () => {
  mocks.limit.mockResolvedValue({
    data: [{ scroll_pct: 0.06, read_pct: 0.55, papers: { id: "p1", title: "Paper" } }],
    error: null,
  });
  const items = await getContinueReading("user-1");
  expect(items[0].scrollPct).toBe(0.06);
});
