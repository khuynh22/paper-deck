// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const actions = vi.hoisted(() => ({
  saveProgress: vi.fn(), createHighlight: vi.fn(),
  updateHighlightNote: vi.fn(), deleteHighlight: vi.fn(),
}));
vi.mock("@/app/actions/progress", () => ({ saveProgress: actions.saveProgress }));
vi.mock("@/app/actions/highlights", () => actions);

import { POST } from "@/app/api/reader/mutations/route";

const ID = "10000000-0000-4000-8000-000000000001";
const valid = { operation: "progress", paperId: ID, update: { markedPct: 0.4 } };
function request(body: unknown = valid, headers: Record<string, string> = {}) {
  return new NextRequest("https://reader.test/api/reader/mutations", {
    method: "POST", headers: { origin: "https://reader.test", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  for (const action of Object.values(actions)) action.mockReset().mockResolvedValue({ ok: true, data: undefined });
});

test.each(["https://other.test", "null", ""])("rejects writes from origin %s before calling an action", async origin => {
  expect((await POST(request(valid, { origin }))).status).toBe(403);
  expect(actions.saveProgress).not.toHaveBeenCalled();
});

test("requires an origin even when a request carries session cookies", async () => {
  const input = request();
  input.headers.delete("origin");
  input.headers.set("cookie", "session=present");
  expect((await POST(input)).status).toBe(403);
  expect(actions.saveProgress).not.toHaveBeenCalled();
});

test.each([
  { ...valid, update: { scrollPct: 1.2 } },
  { operation: "note", id: ID, note: "x".repeat(2001) },
  { operation: "delete", id: "not-a-uuid" },
  { operation: "unrecognized", paperId: ID },
])("rejects invalid mutation input without writes: $operation", async input => {
  expect((await POST(request(input))).status).toBe(400);
  expect(Object.values(actions).every(action => action.mock.calls.length === 0)).toBe(true);
});

test("rejects malformed JSON, non-JSON and oversized requests", async () => {
  const malformed = new NextRequest("https://reader.test/api/reader/mutations", {
    method: "POST", headers: { origin: "https://reader.test", "content-type": "application/json" }, body: "{",
  });
  expect((await POST(malformed)).status).toBe(400);
  expect((await POST(request(valid, { "content-type": "text/plain" }))).status).toBe(415);
  expect((await POST(request({ ...valid, ignored: "x".repeat(16384) }))).status).toBe(413);
  expect(actions.saveProgress).not.toHaveBeenCalled();
});

test("waits for the authenticated action acknowledgement and disables caching", async () => {
  let finish!: (result: { ok: true; data: undefined }) => void;
  actions.saveProgress.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  let responded = false;
  const pending = POST(request()).then(response => { responded = true; return response; });
  await vi.waitFor(() => expect(actions.saveProgress).toHaveBeenCalledWith(ID, valid.update));
  expect(responded).toBe(false);
  finish({ ok: true, data: undefined });
  const response = await pending;
  expect(await response.json()).toEqual({ ok: true });
  expect(response.headers.get("cache-control")).toBe("no-store");
});

test("uses the session action's authentication result without acknowledging a save", async () => {
  actions.saveProgress.mockResolvedValue({ ok: false, code: "auth", message: "Sign in again." });
  const response = await POST(request());
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ ok: false, code: "auth" });
});

test("retains the client UUID and strips a forged owner from highlight creation", async () => {
  const input = { paperId: ID, blockAnchor: "0", startOffset: 0, endOffset: 4, quote: "Text", userId: ID };
  await POST(request({ operation: "highlight", input, requestId: ID }));
  expect(actions.createHighlight).toHaveBeenCalledWith({
    paperId: ID, blockAnchor: "0", startOffset: 0, endOffset: 4, quote: "Text",
  }, ID);
});

test("a thrown storage error returns a failure acknowledgement", async () => {
  actions.deleteHighlight.mockRejectedValue(new Error("Connection lost"));
  const response = await POST(request({ operation: "delete", id: ID }));
  expect(response.status).toBe(500);
  expect(await response.json()).toMatchObject({ ok: false, code: "storage" });
});
