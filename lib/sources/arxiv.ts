import { XMLParser } from "fast-xml-parser";
import type { NormalizedPaper } from "@/lib/types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

function toArray<T>(x: T | T[] | undefined | null): T[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

/** A value that may be a plain string or an object with a `#text` field. */
function textOf(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)["#text"]);
  }
  return null;
}

function cleanArxivId(rawId: string): string | null {
  const afterAbs = rawId.split("/abs/")[1];
  if (!afterAbs) return null;
  return afterAbs.replace(/v\d+$/, "");
}

/** Parse an arXiv Atom feed (string) into normalized papers. Pure + testable. */
export function parseArxivAtom(xml: string): NormalizedPaper[] {
  const parsed = parser.parse(xml);
  const entries = toArray<Record<string, unknown>>(parsed?.feed?.entry);

  return entries.map((e) => {
    const arxivId = cleanArxivId(String(e.id ?? ""));
    const authors = toArray<{ name?: string }>(e.author as never)
      .map((a) => a?.name)
      .filter((n): n is string => Boolean(n));
    const categories = toArray<{ "@_term"?: string }>(e.category as never)
      .map((c) => c?.["@_term"])
      .filter((t): t is string => Boolean(t));
    const doi = textOf(e["arxiv:doi"]);

    return {
      arxivId,
      doi,
      title: String(e.title ?? "")
        .trim()
        .replace(/\s+/g, " "),
      authors,
      abstract: String(e.summary ?? "").trim() || null,
      categories,
      htmlUrl: arxivId ? `https://arxiv.org/html/${arxivId}` : null,
      pdfUrl: arxivId ? `https://arxiv.org/pdf/${arxivId}` : null,
      sourceUrl: arxivId ? `https://arxiv.org/abs/${arxivId}` : null,
      publishedAt: (textOf(e.published) ?? null) as string | null,
      signals: {},
    };
  });
}

/** Fetch the latest papers across the given arXiv categories. */
export async function fetchArxivLatest(
  categories: string[] = ["cs.LG", "cs.AI", "cs.CL", "cs.CV"],
  max = 50,
): Promise<NormalizedPaper[]> {
  const query = categories.map((c) => `cat:${c}`).join("+OR+");
  const url =
    `https://export.arxiv.org/api/query?search_query=${query}` +
    `&sortBy=submittedDate&sortOrder=descending&start=0&max_results=${max}`;
  const res = await fetch(url, { headers: { "User-Agent": "PaperDeck/1.0 (research reader)" } });
  if (!res.ok) throw new Error(`arxiv ${res.status}`);
  return parseArxivAtom(await res.text());
}

/**
 * Words arXiv's fielded search drops from boolean queries (Lucene's classic
 * English stopword list). A term like `all:is` inside an AND chain matches
 * nothing — verified against the live API: "all:attention AND all:is" returns
 * zero entries even though both words appear in many titles.
 */
const ARXIV_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "if", "in",
  "into", "is", "it", "no", "not", "of", "on", "or", "such", "that", "the",
  "their", "then", "there", "these", "they", "this", "to", "was", "will", "with",
]);

/**
 * Pull an arXiv id out of a pasted id, "arXiv:…" reference, or arxiv.org URL
 * (abs/pdf/html, any version suffix). Returns null for ordinary search text.
 */
export function extractArxivId(input: string): string | null {
  const s = input.trim();
  const newStyle = String.raw`\d{4}\.\d{4,5}`;
  const oldStyle = String.raw`[a-z-]+(?:\.[A-Za-z]{2})?\/\d{7}`;

  const url = s.match(
    new RegExp(
      String.raw`arxiv\.org\/(?:abs|pdf|html)\/(${newStyle}|${oldStyle})(?:v\d+)?(?:\.pdf)?(?:[?#]|$)`,
      "i",
    ),
  );
  if (url) return url[1];

  const bare = s.match(new RegExp(String.raw`^(?:arxiv:\s*)?(${newStyle}|${oldStyle})(?:v\d+)?$`, "i"));
  return bare ? bare[1] : null;
}

/** Build the arXiv API URL that fetches one paper by id. Pure + testable. */
export function buildArxivIdUrl(arxivId: string): string {
  return `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}&max_results=1`;
}

/** Build the arXiv API URL for a free-text relevance search. Pure + testable. */
export function buildArxivSearchUrl(query: string, max = 25): string {
  // arXiv reads a literal space as OR, and silently drops stopwords from AND
  // chains (killing the whole conjunction). So a multi-word query searches the
  // exact phrase OR the AND of its non-stopword terms: the phrase branch finds
  // pasted titles ("Attention Is All You Need"), the AND branch keeps topical
  // queries broad ("diffusion models").
  const terms = query.trim().split(/\s+/).filter(Boolean);
  const content = terms.filter((t) => !ARXIV_STOPWORDS.has(t.toLowerCase()));
  const andTerms = content.length > 0 ? content : terms;

  const andGroup = andTerms.map((t) => `all:${encodeURIComponent(t)}`).join("+AND+");
  const searchQuery =
    terms.length > 1
      ? `all:%22${terms.map(encodeURIComponent).join("+")}%22+OR+` +
        (andTerms.length > 1 ? `%28${andGroup}%29` : andGroup)
      : andGroup;

  return (
    `https://export.arxiv.org/api/query?search_query=${searchQuery}` +
    `&sortBy=relevance&sortOrder=descending&start=0&max_results=${max}`
  );
}

/**
 * Search arXiv by free text, most relevant first. A pasted arXiv id or URL
 * fetches that exact paper. Returns [] for a blank query.
 */
export async function searchArxiv(query: string, max = 25): Promise<NormalizedPaper[]> {
  if (!query.trim()) return [];
  const id = extractArxivId(query);
  const url = id ? buildArxivIdUrl(id) : buildArxivSearchUrl(query, max);
  const res = await fetch(url, {
    headers: { "User-Agent": "PaperDeck/1.0 (research reader)" },
  });
  if (!res.ok) throw new Error(`arxiv ${res.status}`);
  return parseArxivAtom(await res.text());
}
