import { test, expect } from "vitest";
import { boundedPage, pageWindow, pdfTextMarkup } from "@/lib/reader/pdf";
test("PDF window stays bounded across long documents and invalid anchors", () => {
  for (const page of [-1, 1, 2, 500, 1000, 2000]) {
    const window = pageWindow(page, 1000);
    expect(window.last - window.first + 1).toBeLessThanOrEqual(5);
    expect(window.first).toBeGreaterThanOrEqual(1);
    expect(window.last).toBeLessThanOrEqual(1000);
  }
  expect(boundedPage(NaN, 10)).toBe(1);
  expect(boundedPage(500, 10)).toBe(10);
});
test("PDF search markup escapes document text and query as data", () => {
  expect(pdfTextMarkup('<img src=x onerror="alert(1)">', "src")).toBe(
    "&lt;img <mark>src</mark>=x onerror=&quot;alert(1)&quot;&gt;",
  );
  expect(pdfTextMarkup("Research research", "RESEARCH")).toBe(
    "<mark>Research</mark> <mark>research</mark>",
  );
  expect(pdfTextMarkup("<script>", "<script>")).toBe(
    "<mark>&lt;script&gt;</mark>",
  );
});

test("search preserves original offsets when case folding changes length", () => {
  expect(pdfTextMarkup("İResearch", "research")).toBe("İ<mark>Research</mark>");
});
