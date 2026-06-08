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

/** Build the arXiv API URL for a free-text relevance search. Pure + testable. */
export function buildArxivSearchUrl(query: string, max = 25): string {
  // arXiv reads a literal space as OR; join whitespace-separated terms with AND so a
  // multi-word query matches papers about *all* the terms, not any of them. (Verified
  // against the live API: bare "all:diffusion models" parses as "all:diffusion OR all:models".)
  const searchQuery = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `all:${encodeURIComponent(term)}`)
    .join("+AND+");
  return (
    `https://export.arxiv.org/api/query?search_query=${searchQuery}` +
    `&sortBy=relevance&sortOrder=descending&start=0&max_results=${max}`
  );
}

/** Search arXiv by free text, most relevant first. Returns [] for a blank query. */
export async function searchArxiv(query: string, max = 25): Promise<NormalizedPaper[]> {
  if (!query.trim()) return [];
  const res = await fetch(buildArxivSearchUrl(query, max), {
    headers: { "User-Agent": "PaperDeck/1.0 (research reader)" },
  });
  if (!res.ok) throw new Error(`arxiv ${res.status}`);
  return parseArxivAtom(await res.text());
}
