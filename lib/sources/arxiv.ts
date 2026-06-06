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
    `http://export.arxiv.org/api/query?search_query=${query}` +
    `&sortBy=submittedDate&sortOrder=descending&start=0&max_results=${max}`;
  const res = await fetch(url, { headers: { "User-Agent": "PaperDeck/1.0 (research reader)" } });
  if (!res.ok) throw new Error(`arxiv ${res.status}`);
  return parseArxivAtom(await res.text());
}
