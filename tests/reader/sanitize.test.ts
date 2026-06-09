import { test, expect } from "vitest";
import { sanitizePaperHtml, extractMainContent } from "@/lib/reader/sanitize";

test("extracts the article body and drops surrounding page chrome", () => {
  const doc = `<header><nav>menu</nav></header><article class="ltx_document"><p>body</p></article><footer>foot</footer>`;
  const out = extractMainContent(doc);
  expect(out).toContain("<p>body</p>");
  expect(out).not.toContain("menu");
  expect(out).not.toContain("foot");
});

test("extractMainContent leaves a bare fragment unchanged", () => {
  expect(extractMainContent("<p>a</p><p>b</p>")).toBe("<p>a</p><p>b</p>");
});

test("sanitize drops chrome so anchors only cover the paper body", () => {
  const doc = `<header data-blk-x><nav>menu</nav></header><article><p>intro</p><p>method</p></article>`;
  const out = sanitizePaperHtml(doc, "2401.1");
  expect(out).not.toContain("menu");
  expect(out).toContain('data-blk="0"');
  expect(out).toContain("intro");
});

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

test("resolves a relative image src (incl. arXiv's version dir) against the page url", () => {
  // Real arXiv HTML emits srcs that already include the versioned paper dir, e.g.
  // <img src="2606.06494v1/x1.png">. Resolving against the page URL must NOT double it.
  const out = sanitizePaperHtml(
    `<img src="2606.06494v1/x1.png">`,
    "https://arxiv.org/html/2606.06494v1",
  );
  expect(out).toContain('src="https://arxiv.org/html/2606.06494v1/x1.png"');
  expect(out).not.toContain("2606.06494v1/2606.06494v1");
});

test("resolves a relative image src in a subfolder", () => {
  const out = sanitizePaperHtml(
    `<img src="2606.06494v1/figures/head_penalty.png">`,
    "https://arxiv.org/html/2606.06494v1",
  );
  expect(out).toContain("https://arxiv.org/html/2606.06494v1/figures/head_penalty.png");
});

test("leaves absolute image urls untouched", () => {
  const out = sanitizePaperHtml(
    `<img src="https://cdn.example.com/x.png">`,
    "https://arxiv.org/html/2401.1",
  );
  expect(out).toContain("https://cdn.example.com/x.png");
});

test("keeps fragment + relative links (citations, eq/section refs) but drops javascript: hrefs", () => {
  // Academic HTML navigates via fragments: citations (#bib.bib1), equation and
  // section refs (#S3.E2). These must survive sanitizing or in-reader nav breaks.
  const out = sanitizePaperHtml(
    `<a href="#bib.bib1">[1]</a><a href="#S3.E2">Eq</a><a href="/abs/2401.1">p</a><a href="javascript:alert(1)">x</a>`,
    "2401.1",
  );
  expect(out).toContain('href="#bib.bib1"');
  expect(out).toContain('href="#S3.E2"');
  expect(out).toContain('href="/abs/2401.1"');
  expect(out).not.toContain("javascript:");
});

test("tags block elements with sequential data-blk indices", () => {
  const out = sanitizePaperHtml(`<p>a</p><p class="x">b</p><h2>c</h2>`, "2401.1");
  expect(out).toContain('data-blk="0"');
  expect(out).toContain('data-blk="1"');
  expect(out).toContain('data-blk="2"');
  // preserves existing attributes
  expect(out).toContain('class="x"');
});
