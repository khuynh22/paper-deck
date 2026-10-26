import { expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePaperId } from "@/lib/db/paperIdentity";

function database(data: { canonical_id: string } | null, error: { message: string } | null = null) {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => ({ data, error })) };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const db = { from: vi.fn(() => query) };
  return { db: db as unknown as SupabaseClient, query };
}

test("old IDs resolve to their public canonical paper", async () => {
  const { db, query } = database({ canonical_id: "canonical" });
  expect(await resolvePaperId(db, "old")).toBe("canonical");
  expect(query.eq).toHaveBeenCalledWith("paper_id", "old");
});

test("an unmapped paper keeps its ID", async () => {
  expect(await resolvePaperId(database(null).db, "current")).toBe("current");
});

test("lookup failures are not silently interpreted as missing redirects", async () => {
  await expect(resolvePaperId(database(null, { message: "unavailable" }).db, "old")).rejects.toThrow("identity lookup failed");
});
