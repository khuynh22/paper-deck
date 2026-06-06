import { test, expect, vi, afterEach } from "vitest";
import { loadReaderHtml } from "@/lib/reader/fetchHtml";

const bigHtml = (marker: string) => `<html><body>${"<p>x</p>".repeat(500)}${marker}</body></html>`;

afterEach(() => vi.unstubAllGlobals());

function mockFetch(handler: (url: string) => { ok: boolean; body: string }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const { ok, body } = handler(String(input));
      return { ok, text: async () => body } as Response;
    }),
  );
}

test("returns sanitized html when arxiv HTML is available", async () => {
  mockFetch((url) => ({ ok: url.includes("arxiv.org/html"), body: bigHtml("<p>ARXIV</p>") }));
  const res = await loadReaderHtml("2401.1");
  expect(res.kind).toBe("html");
  if (res.kind === "html") expect(res.html).toContain("ARXIV");
});

test("falls back to ar5iv when arxiv HTML 404s", async () => {
  mockFetch((url) => {
    if (url.includes("arxiv.org/html")) return { ok: false, body: "" };
    return { ok: url.includes("ar5iv"), body: bigHtml("<p>AR5IV</p>") };
  });
  const res = await loadReaderHtml("2401.1");
  expect(res.kind).toBe("html");
  if (res.kind === "html") expect(res.html).toContain("AR5IV");
});

test("returns none when neither source has usable html", async () => {
  mockFetch(() => ({ ok: true, body: "<html>tiny stub</html>" }));
  const res = await loadReaderHtml("2401.1");
  expect(res.kind).toBe("none");
});

test("returns none on network errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("network down");
    }),
  );
  const res = await loadReaderHtml("2401.1");
  expect(res.kind).toBe("none");
});
