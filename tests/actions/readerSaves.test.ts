import { beforeEach, expect, test, vi } from "vitest";

const db = vi.hoisted(() => {
  const result = vi.fn();
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const name of ["upsert", "insert", "update", "delete", "select", "eq"]) {
    query[name] = vi.fn(() => query);
  }
  query.single = result;
  query.maybeSingle = result;
  query.then = vi.fn((resolve, reject) => Promise.resolve(result()).then(resolve, reject));
  return { query, result, getUser: vi.fn(), from: vi.fn(() => query) };
});
vi.mock("@/lib/db/server", () => ({ serverClient: async () => db }));
vi.mock("@/lib/auth", () => ({ currentUser: async () => (await db.getUser()).data.user, authenticatedUser: async () => db.getUser() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveProgress } from "@/app/actions/progress";
import { createHighlight, updateHighlightNote, deleteHighlight } from "@/app/actions/highlights";

const ID = "d75713aa-2a0c-4f01-a192-9a8df3e3d395";
const input = { paperId: "p1", blockAnchor: "0", startOffset: 0, endOffset: 4, quote: "text", note: null };
const row = { id: ID, paper_id: "p1", block_anchor: "0", start_offset: 0, end_offset: 4, quote: "text", note: null };

beforeEach(() => {
  vi.clearAllMocks();
  db.result.mockReset();
  Object.assign(db, { auth: { getUser: db.getUser } });
  db.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
  db.result.mockResolvedValue({ data: row, error: null });
});

test("progress reports a database failure instead of acknowledging the save", async () => {
  db.result.mockResolvedValue({ data: null, error: { code: "XX000", message: "private database details" } });
  expect(await saveProgress("p1", { scrollPct: 0.5 })).toMatchObject({ ok: false, code: "storage" });
});

test("progress acknowledges a persisted write", async () => {
  expect(await saveProgress("p1", { scrollPct: 0.5 })).toMatchObject({ ok: true });
});

test("missing session is reported separately from a failed write", async () => {
  db.getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect(await saveProgress("p1", { scrollPct: 0.5 })).toMatchObject({ ok: false, code: "auth" });
  expect(db.from).not.toHaveBeenCalled();
});

test("auth service outages are not presented as signed-out sessions", async () => {
  db.getUser.mockResolvedValue({ data: { user: null }, error: { status: 503 } });
  expect(await saveProgress("p1", { scrollPct: 0.5 })).toMatchObject({ ok: false, code: "storage" });
});

test("a JWT expiring during the write is reported as an auth failure", async () => {
  db.result.mockResolvedValue({ data: null, error: { code: "PGRST301" } });
  expect(await saveProgress("p1", { scrollPct: 0.5 })).toMatchObject({ ok: false, code: "auth" });
});

test("transport exceptions return a retryable failure without exposing internals", async () => {
  db.result.mockRejectedValue(new Error("secret connection detail"));
  const result = await saveProgress("p1", { scrollPct: 0.5 });
  expect(result).toMatchObject({ ok: false, code: "storage" });
  expect(JSON.stringify(result)).not.toContain("secret");
});

test("note update checks the returned row instead of claiming a zero-row update succeeded", async () => {
  db.result.mockResolvedValue({ data: null, error: null });
  expect(await updateHighlightNote(ID, "draft")).toMatchObject({ ok: false });
});

test("note update errors remain failures", async () => {
  db.result.mockResolvedValue({ data: null, error: { code: "XX000" } });
  expect(await updateHighlightNote(ID, "draft")).toMatchObject({ ok: false, code: "storage" });
});

test("delete errors remain failures", async () => {
  db.result.mockResolvedValue({ data: null, error: { code: "XX000" } });
  expect(await deleteHighlight(ID)).toMatchObject({ ok: false, code: "storage" });
});

test("deleting an already absent owned highlight is idempotent", async () => {
  db.result.mockResolvedValue({ data: [], error: null });
  expect(await deleteHighlight(ID)).toMatchObject({ ok: true });
});

test("highlight creation returns a typed acknowledgement", async () => {
  expect(await createHighlight(input, ID)).toEqual({ ok: true, data: { ...input, id: ID } });
});

test("retrying creation with the same ID recovers the stored highlight without overwriting its note", async () => {
  db.result.mockResolvedValueOnce({ data: null, error: { code: "23505" } });
  db.result.mockResolvedValueOnce({ data: { ...row, note: "already edited" }, error: null });
  expect(await createHighlight(input, ID)).toEqual({ ok: true, data: { ...input, id: ID, note: "already edited" } });
  expect(db.query.update).not.toHaveBeenCalled();
  expect(db.query.upsert).not.toHaveBeenCalled();
  expect(db.query.eq).toHaveBeenCalledWith("user_id", "u1");
});

test("a duplicate ID belonging to another user is not acknowledged", async () => {
  db.result.mockResolvedValueOnce({ data: null, error: { code: "23505" } });
  db.result.mockResolvedValueOnce({ data: null, error: null });
  expect(await createHighlight(input, ID)).toMatchObject({ ok: false });
});

test("invalid request IDs are rejected before writing", async () => {
  expect(await createHighlight(input, "invalid")).toMatchObject({ ok: false, code: "validation" });
  expect(db.query.insert).not.toHaveBeenCalled();
});

test("invalid highlight ranges are rejected without a write", async () => {
  expect(await createHighlight({ ...input, endOffset: 0 }, ID)).toMatchObject({ ok: false, code: "validation" });
  expect(db.query.insert).not.toHaveBeenCalled();
});

test.each([
  ["create", () => createHighlight(input, ID)],
  ["update", () => updateHighlightNote(ID, "draft")],
  ["delete", () => deleteHighlight(ID)],
])("signed-out highlight %s reports an auth failure without a write", async (_, action) => {
  db.getUser.mockResolvedValue({ data: { user: null }, error: null });
  expect(await action()).toMatchObject({ ok: false, code: "auth" });
  expect(db.from).not.toHaveBeenCalled();
});

test("highlight creation sends the stable UUID and authenticated owner to the database", async () => {
  await createHighlight(input, ID);
  expect(db.query.insert).toHaveBeenCalledWith(expect.objectContaining({ id: ID, user_id: "u1" }));
});

test("a highlight removed in another tab is non-retryable", async () => {
  db.result.mockResolvedValue({ data: null, error: null });
  expect(await updateHighlightNote(ID, "draft")).toMatchObject({ ok: false, code: "not_found" });
});

test("a malformed highlight ID does not reach the database", async () => {
  expect(await updateHighlightNote("invalid", "draft")).toMatchObject({ ok: false, code: "not_found" });
  expect(db.query.update).not.toHaveBeenCalled();
});

test("an unresolved duplicate highlight is non-retryable", async () => {
  db.result.mockResolvedValueOnce({ data: null, error: { code: "23505" } });
  db.result.mockResolvedValueOnce({ data: null, error: null });
  expect(await createHighlight(input, ID)).toMatchObject({ ok: false, code: "not_found",
    message: expect.not.stringMatching(/note/i) });
});
