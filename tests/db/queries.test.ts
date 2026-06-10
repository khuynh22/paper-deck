import { test, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => {
  const eq = vi.fn(
    async (): Promise<{ data: { paper_id: string }[] | null; error: { message: string } | null }> => ({
      data: [],
      error: null,
    }),
  );
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { eq, from };
});
vi.mock("@/lib/db/server", () => ({ serverClient: async () => ({ from: mocks.from }) }));

import { getStarredIds } from "@/lib/db/queries";

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
