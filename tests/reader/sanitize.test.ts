import { test, expect } from "vitest";
import { sanitizePaperHtml } from "@/lib/reader/sanitize";

test("strips script tags and inline handlers", () => {
  const out = sanitizePaperHtml(`<p>ok</p><script>alert(1)</script>`, "2401.1");
  expect(out).not.toContain("<script");
  expect(out).not.toContain("alert(1)");
});

test("keeps MathML elements", () => {
  const out = sanitizePaperHtml(`<math><mrow><mi>x</mi><mo>=</mo><mn>1</mn></mrow></math>`, "2401.1");
  expect(out).toContain("<math");
  expect(out).toContain("<mi");
  expect(out).toContain("<mo");
});

test("rewrites a relative image src to an absolute arxiv url", () => {
  const out = sanitizePaperHtml(`<img src="figures/f1.png">`, "2401.12345");
  expect(out).toContain("https://arxiv.org/html/2401.12345/figures/f1.png");
});

test("leaves absolute image urls untouched", () => {
  const out = sanitizePaperHtml(`<img src="https://cdn.example.com/x.png">`, "2401.1");
  expect(out).toContain("https://cdn.example.com/x.png");
});

test("tags block elements with sequential data-blk indices", () => {
  const out = sanitizePaperHtml(`<p>a</p><p class="x">b</p><h2>c</h2>`, "2401.1");
  expect(out).toContain('data-blk="0"');
  expect(out).toContain('data-blk="1"');
  expect(out).toContain('data-blk="2"');
  // preserves existing attributes
  expect(out).toContain('class="x"');
});
