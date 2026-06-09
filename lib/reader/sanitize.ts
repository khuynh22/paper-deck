import sanitizeHtml from "sanitize-html";

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

// MathML presentation attributes worth keeping so equations render correctly.
const MATHML_ATTRS = [
  "display", "displaystyle", "scriptlevel", "mathvariant", "mathsize",
  "mathcolor", "mathbackground", "encoding", "columnalign", "rowalign",
  "columnspan", "columnlines", "rowlines", "frame", "framespacing",
  "equalrows", "equalcolumns", "align", "width", "height", "depth",
  "lspace", "rspace", "linethickness", "open", "close", "separators",
  "stretchy", "fence", "accent", "accentunder", "largeop", "movablelimits",
  "form", "notation", "voffset", "minsize", "maxsize", "symmetric",
];

// Structural/presentational attributes kept on any element (no event handlers).
const COMMON_ATTRS = ["class", "id", "style", "title", "lang", "dir"];
const TABLE_ATTRS = ["colspan", "rowspan", "valign", "scope", "headers"];

const BLOCK_TAGS = "p|h1|h2|h3|h4|h5|h6|li|figure|table|blockquote|pre|section|div";

/**
 * Extract the paper body from a full arXiv/ar5iv document so page chrome (nav,
 * header, footer) doesn't render in the reader or pollute the highlight anchors.
 * Falls back to the original string when no article/main wrapper is found.
 */
export function extractMainContent(html: string): string {
  const articleStart = html.search(/<article\b[^>]*>/i);
  if (articleStart !== -1) {
    const end = html.lastIndexOf("</article>");
    if (end > articleStart) return html.slice(articleStart, end + "</article>".length);
  }
  const mainStart = html.search(/<main\b[^>]*>/i);
  if (mainStart !== -1) {
    const end = html.lastIndexOf("</main>");
    if (end > mainStart) return html.slice(mainStart, end + "</main>".length);
  }
  return html;
}

/**
 * Absolutize relative <img src> against the source page's URL BEFORE sanitizing.
 * arXiv HTML emits srcs that already include the versioned paper dir (e.g.
 * "2606.06494v1/x1.png"), so resolving against the page URL with the URL parser
 * yields the right target without doubling the paper path. Works for both the
 * arxiv.org/html and ar5iv.org sources.
 */
function absolutizeImages(html: string, baseUrl: string): string {
  return html.replace(
    /(<img\b[^>]*\bsrc=")(?!https?:|data:)([^"]*)"/gi,
    (m, pre: string, src: string) => {
      try {
        return `${pre}${new URL(src, baseUrl).href}"`;
      } catch {
        return m; // unparseable base/src — leave the tag untouched
      }
    },
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
 * - keeps MathML (equations), figures, tables
 * - drops scripts/styles/iframes/forms and every event-handler attribute
 * - resolves relative image URLs against the source page URL (`baseUrl`)
 * - tags block elements with `data-blk` indices (for resume + highlight)
 *
 * Uses the parser-based `sanitize-html` (no DOM): pure JS with no jsdom, so it
 * loads and runs reliably in bundled serverless functions. (jsdom's runtime
 * `require()` chain throws ERR_REQUIRE_ESM on older serverless Node.)
 */
export function sanitizePaperHtml(html: string, baseUrl: string): string {
  const absolutized = absolutizeImages(extractMainContent(html), baseUrl);
  const clean = sanitizeHtml(absolutized, {
    // <img> and MathML aren't in sanitize-html's defaults; everything else we
    // need (figure, table, section, lists, headings…) already is.
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", ...MATHML_TAGS],
    allowedAttributes: {
      "*": [...COMMON_ATTRS, ...TABLE_ATTRS, ...MATHML_ATTRS],
      a: ["href", "name", "target", "rel"],
      img: ["src", "srcset", "alt", "title", "width", "height", "loading"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowProtocolRelative: false,
    // <script>/<style> tags AND their text content are dropped by default.
  });
  return tagBlocks(clean);
}
