import { beforeEach, test, expect, vi } from "vitest";
const db = vi.hoisted(() => {
  const result = vi.fn();
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const name of ["upsert", "insert", "update", "delete", "select", "eq"])
    query[name] = vi.fn(() => query);
  query.single = result;
  query.then = vi.fn((resolve, reject) =>
    Promise.resolve(result()).then(resolve, reject),
  );
  return { query, result, getUser: vi.fn(), from: vi.fn(() => query) };
});
vi.mock("@/lib/db/server", () => ({
  serverClient: async () => ({ ...db, auth: { getUser: db.getUser } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import {
  createCollection,
  renameCollection,
  deleteCollection,
  setCollectionMembership,
  setLibraryStatus,
} from "@/app/actions/library";
const id = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  db.getUser.mockResolvedValue({
    data: { user: { id: "owner" } },
    error: null,
  });
  db.result.mockResolvedValue({ data: { id, paper_id: id }, error: null });
});
test("status changes write only status and identity/timestamp fields", async () => {
  expect(await setLibraryStatus(id, "done")).toMatchObject({ ok: true });
  expect(db.query.upsert).toHaveBeenCalledWith(
    {
      user_id: "owner",
      paper_id: id,
      status: "done",
      updated_at: expect.any(String),
    },
    { onConflict: "user_id,paper_id" },
  );
});
test("collection writes authenticate and bind ownership on the server", async () => {
  expect(await createCollection(id, " Project ")).toMatchObject({ ok: true });
  expect(db.query.upsert).toHaveBeenCalledWith(
    { id, user_id: "owner", name: "Project" },
    { onConflict: "id" },
  );
  await renameCollection(id, "Renamed");
  await deleteCollection(id);
  expect(db.query.eq).toHaveBeenCalledWith("user_id", "owner");
});
test("membership uses the current owner and an idempotent composite key", async () => {
  expect(await setCollectionMembership(id, id, true)).toMatchObject({
    ok: true,
  });
  expect(db.query.upsert).toHaveBeenCalledWith(
    { user_id: "owner", collection_id: id, paper_id: id },
    { onConflict: "user_id,collection_id,paper_id" },
  );
});
test("invalid names, IDs and statuses are rejected before database access", async () => {
  expect(await createCollection(id, " ")).toMatchObject({
    ok: false,
    code: "validation",
  });
  expect(await renameCollection(id, "x".repeat(81))).toMatchObject({
    ok: false,
    code: "validation",
  });
  expect(await deleteCollection("bad")).toMatchObject({
    ok: false,
    code: "validation",
  });
  // Server actions must validate runtime input, including forged payloads.
  expect(await setLibraryStatus(id, "bad" as "done")).toMatchObject({
    ok: false,
    code: "validation",
  });
  expect(db.from).not.toHaveBeenCalled();
});
test("expired sessions and rejected writes never acknowledge success", async () => {
  db.getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect(await createCollection(id, "Project")).toMatchObject({
    ok: false,
    code: "auth",
  });
  expect(db.from).not.toHaveBeenCalled();
  db.getUser.mockResolvedValue({
    data: { user: { id: "owner" } },
    error: null,
  });
  db.result.mockResolvedValue({ data: null, error: { code: "42501" } });
  expect(await setCollectionMembership(id, id, true)).toMatchObject({
    ok: false,
    code: "storage",
  });
  db.result.mockResolvedValue({ data: null, error: null });
  expect(await renameCollection(id, "Project")).toMatchObject({ ok: false });
});

test("duplicate names have an actionable validation message", async () => {
  db.result.mockResolvedValue({ data: null, error: { code: "23505" } });
  expect(await createCollection(id, "Project")).toMatchObject({
    ok: false,
    code: "validation",
    message: "A collection with that name already exists.",
  });
});
