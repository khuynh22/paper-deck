import { afterEach, expect, test, vi } from "vitest";
import { createHighlight, saveProgress, updateHighlightNote } from "@/lib/reader/mutations";

const ID = "10000000-0000-4000-8000-000000000001";
const input = { paperId: ID, blockAnchor: "0", startOffset: 0, endOffset: 4, quote: "Text" };

afterEach(() => vi.unstubAllGlobals());

test("a lost creation response retries the same UUID without overwriting an edited note", async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError("Connection lost")).mockResolvedValueOnce(
    new Response(JSON.stringify({ ok: true, data: { ...input, id: ID, note: "Already edited" } })),
  );
  vi.stubGlobal("fetch", fetch);
  expect(await createHighlight(input, ID)).toMatchObject({ ok: false, code: "storage" });
  expect(await createHighlight(input, ID)).toMatchObject({ ok: true, data: { id: ID, note: "Already edited" } });
  expect(fetch.mock.calls[1]).toEqual(fetch.mock.calls[0]);
});

test.each([
  new Response("<html>Deployment unavailable</html>", { status: 200 }),
  new Response(JSON.stringify({ ok: true, data: { id: ID } })),
  new Response(JSON.stringify({ ok: "true" })),
])("never acknowledges an invalid highlight response", async response => {
  vi.stubGlobal("fetch", vi.fn(async () => response));
  expect(await createHighlight(input, ID)).toMatchObject({ ok: false, code: "storage" });
});

test("expired authentication keeps the edit available for sign-in and retry", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("Unauthorized", { status: 401 })));
  expect(await updateHighlightNote(ID, "Unsaved note")).toMatchObject({ ok: false, code: "auth" });
});

test("a rejected edit keeps its non-retryable validation result", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    ok: false, code: "validation", message: "Select a shorter passage and try again.",
  }), { status: 400 })));
  expect(await createHighlight(input, ID)).toMatchObject({ ok: false, code: "validation" });
});

test("acknowledges a progress save without depending on a serialized undefined field", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }))));
  expect(await saveProgress(ID, { scrollPct: 0.2 })).toEqual({ ok: true, data: undefined });
});
