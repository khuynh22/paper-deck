import { test, expect, vi, afterEach } from "vitest";
import { loadReaderHtml } from "@/lib/reader/fetchHtml";

const bigHtml = (marker: string) => `<html><body>${"<p>x</p>".repeat(500)}${marker}</body></html>`;

afterEach(() => vi.unstubAllGlobals());

function mockFetch(handler: (url: string) => { ok: boolean; body: string; finalUrl?: string }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const { ok, body, finalUrl } = handler(String(input));
      return { ok, url: finalUrl ?? String(input), text: async () => body } as Response;
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

test("absolutizes relative image srcs against the fetched page url", async () => {
  mockFetch((url) => ({
    ok: url.includes("arxiv.org/html"),
    body: bigHtml(`<img src="2606.06494v1/x1.png">`),
  }));
  const res = await loadReaderHtml("2606.06494");
  expect(res.kind).toBe("html");
  if (res.kind === "html") {
    expect(res.html).toContain("https://arxiv.org/html/2606.06494v1/x1.png");
    expect(res.html).not.toContain("2606.06494v1/2606.06494v1");
  }
});

test("returns none when neither source has usable html", async () => {
  mockFetch(() => ({ ok: true, body: "<html>tiny stub</html>" }));
  const res = await loadReaderHtml("2401.1");
  expect(res.kind).toBe("none");
});

test.each([
  ["https://arxiv.org/html/", "https://arxiv.org/html/2401.00001v1/"],
  ["https://ar5iv.org/abs/", "https://ar5iv.labs.arxiv.org/html/2401.00001/"],
])("resolves SVG objects against the final document URL for %s", async (source, finalUrl) => {
  mockFetch((url) => ({
    ok: url.startsWith(source),
    finalUrl,
    body: `<!--${"fixture ".repeat(260)}--><object type="image/svg+xml" data="figures/diagram.svg"></object>`,
  }));
  const result = await loadReaderHtml("2401.00001");
  expect(result).toMatchObject({ kind: "html", html: expect.stringContaining(`src="${finalUrl}figures/diagram.svg"`) });
});

test("uses ar5iv for a cache originally generated from ar5iv", async () => {
  const cached = '<p data-blk="0">Saved passage.</p>';
  mockFetch((url) => ({
    ok: true,
    finalUrl: url.replace("ar5iv.org/abs/", "ar5iv.labs.arxiv.org/html/") + "/",
    body: `<!--${"fixture ".repeat(260)}--><p>${
      url.includes("ar5iv.org") ? "Saved passage." : "Different passage."
    }</p><object type="image/svg+xml" data="diagram.svg"></object>`,
  }));
  const result = await loadReaderHtml("2401.00001", cached);
  expect(result).toEqual({
    kind: "html",
    html: cached + '<img src="https://ar5iv.labs.arxiv.org/html/2401.00001/diagram.svg" alt="" />',
  });
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
