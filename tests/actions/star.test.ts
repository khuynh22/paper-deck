import { test, expect, vi, beforeEach } from "vitest";
import type { User } from "@supabase/supabase-js";

// Mock the Next/Supabase boundary so the server action runs in vitest.
const mocks = vi.hoisted(() => {
  const upsert = vi.fn(async () => ({ error: null as { message: string } | null }));
  const deleteEq2 = vi.fn(async () => ({ error: null as { message: string } | null }));
  const deleteEq1 = vi.fn(() => ({ eq: deleteEq2 }));
  const del = vi.fn(() => ({ eq: deleteEq1 }));
  const from = vi.fn(() => ({ upsert, delete: del }));
  return {
    upsert,
    deleteEq2,
    from,
    currentUser: vi.fn(async (): Promise<User | null> => null),
    revalidatePath: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({ currentUser: mocks.currentUser }));
vi.mock("@/lib/db/server", () => ({ serverClient: async () => ({ from: mocks.from }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { toggleStar } from "@/app/actions/star";

const USER = { id: "user-1" } as User;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentUser.mockResolvedValue(USER);
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.deleteEq2.mockResolvedValue({ error: null });
});

test("returns auth-required instead of throwing when signed out", async () => {
  mocks.currentUser.mockResolvedValue(null);
  const result = await toggleStar("paper-1", false);
  expect(result).toEqual({ ok: false, error: "auth-required" });
  expect(mocks.from).not.toHaveBeenCalled();
});

test("reports save-failed when the star upsert is rejected (e.g. RLS)", async () => {
  mocks.upsert.mockResolvedValue({ error: { message: "row violates row-level security" } });
  const result = await toggleStar("paper-1", false);
  expect(result).toEqual({ ok: false, error: "save-failed" });
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

test("reports save-failed when the unstar delete is rejected", async () => {
  mocks.deleteEq2.mockResolvedValue({ error: { message: "permission denied" } });
  const result = await toggleStar("paper-1", true);
  expect(result).toEqual({ ok: false, error: "save-failed" });
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});

test("returns the new starred state and revalidates on success", async () => {
  const starResult = await toggleStar("paper-1", false);
  expect(starResult).toEqual({ ok: true, starred: true });
  expect(mocks.upsert).toHaveBeenCalledWith(
    { user_id: "user-1", paper_id: "paper-1" },
    { onConflict: "user_id,paper_id" },
  );

  const unstarResult = await toggleStar("paper-1", true);
  expect(unstarResult).toEqual({ ok: true, starred: false });

  expect(mocks.revalidatePath).toHaveBeenCalledWith("/feed");
  expect(mocks.revalidatePath).toHaveBeenCalledWith("/library");
});
