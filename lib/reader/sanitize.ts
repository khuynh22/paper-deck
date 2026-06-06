import DOMPurify from "isomorphic-dompurify";

const MATHML_TAGS = [
  "math",
  "mrow",
  "mi",
  "mo",
  "mn",
  "ms",
  "mtext",
  "msup",
  "msub",
  "msubsup",
  "mfrac",
  "msqrt",
  "mroot",
  "mtable",
  "mtr",
  "mtd",
  "mstyle",
  "munder",
  "mover",
  "munderover",
  "mspace",
  "mpadded",
  "mphantom",
  "menclose",
  "semantics",
  "annotation",
  "annotation-xml",
];

const BLOCK_TAGS = "p|h1|h2|h3|h4|h5|h6|li|figure|table|blockquote|pre|section|div";

/** Absolutize relative <img src> against the arXiv HTML base BEFORE sanitizing. */
function absolutizeImages(html: string, arxivId: string): string {
  const base = `https://arxiv.org/html/${arxivId}/`;
  return html.replace(
    /(<img\b[^>]*\bsrc=")(?!https?:|data:)([^"]*)"/gi,
    (_m, pre: string, src: string) => `${pre}${base}${src.replace(/^\.?\//, "")}"`,
  );
}

/** Tag block-level elements with sequential data-blk indices for scroll/highlight anchoring. */
function tagBlocks(html: string): string {
  let i = 0;
  return html.replace(
    new RegExp(`<(${BLOCK_TAGS})(\\s|>)`, "gi"),
    (_m, tag: string, tail: string) =>
      `<${tag} data-blk="${i++}"${tail === ">" ? ">" : " "}`,
  );
}

/**
 * Sanitize an arXiv HTML paper for safe in-app rendering.
 * - keeps MathML (equations) and figures
 * - strips scripts/styles/iframes/forms
 * - rewrites relative image URLs to absolute arXiv URLs
 * - tags block elements with `data-blk` indices (for resume + highlight)
 */
export function sanitizePaperHtml(html: string, arxivId: string): string {
  const absolutized = absolutizeImages(html, arxivId);
  const clean = DOMPurify.sanitize(absolutized, {
    ADD_TAGS: [...MATHML_TAGS, "figure", "figcaption"],
    ADD_ATTR: ["mathvariant", "displaystyle", "scriptlevel", "display", "encoding"],
    FORBID_TAGS: ["script", "style", "iframe", "form", "input", "button", "noscript", "link"],
    FORBID_ATTR: ["onerror", "onload", "onclick"],
    ALLOWED_URI_REGEXP: /^(?:https?:|data:image\/|#)/i,
  });
  return tagBlocks(typeof clean === "string" ? clean : String(clean));
}
