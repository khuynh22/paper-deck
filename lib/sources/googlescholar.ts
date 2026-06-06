import { env } from "@/lib/env";
import type { NormalizedPaper } from "@/lib/types";

interface SerpResult {
  title?: string;
  link?: string;
  publication_info?: { summary?: string };
  inline_links?: { cited_by?: { total?: number } };
}
interface SerpResponse {
  organic_results?: SerpResult[];
}

function arxivIdFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  const m = url.match(/arxiv\.org\/(?:abs|pdf|html)\/([0-9]{4}\.[0-9]{4,5})/i);
  return m ? m[1] : null;
}

function authorsFromSummary(summary: string | undefined): string[] {
  if (!summary) return [];
  // Summary looks like "A Author, B Author - Journal, 2020 - publisher.com"
  const firstSegment = summary.split(" - ")[0] ?? "";
  return firstSegment
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function yearFromSummary(summary: string | undefined): string | null {
  const m = summary?.match(/\b(19|20)\d{2}\b/);
  return m ? `${m[0]}-01-01T00:00:00Z` : null;
}

/** Parse a SerpAPI google_scholar response. */
export function parseSerpScholar(json: unknown): NormalizedPaper[] {
  const results = (json as SerpResponse)?.organic_results;
  if (!Array.isArray(results)) return [];
  return results.map((r) => {
    const arxivId = arxivIdFromUrl(r.link);
    return {
      arxivId,
      doi: null,
      title: (r.title ?? "").trim(),
      authors: authorsFromSummary(r.publication_info?.summary),
      abstract: null,
      categories: [],
      htmlUrl: arxivId ? `https://arxiv.org/html/${arxivId}` : null,
      pdfUrl: arxivId ? `https://arxiv.org/pdf/${arxivId}` : null,
      sourceUrl: r.link ?? null,
      publishedAt: yearFromSummary(r.publication_info?.summary),
      signals: { citations: r.inline_links?.cited_by?.total ?? 0 },
    } satisfies NormalizedPaper;
  });
}

/** Owner-only, flagged source. Returns [] unless a SerpAPI key is configured. */
export async function fetchScholar(query = "machine learning"): Promise<NormalizedPaper[]> {
  const key = env().SERPAPI_KEY;
  if (!key) return [];
  const url =
    `https://serpapi.com/search.json?engine=google_scholar` +
    `&q=${encodeURIComponent(query)}&api_key=${key}`;
  const res = await fetch(url, { headers: { "User-Agent": "PaperDeck/1.0 (research reader)" } });
  if (!res.ok) throw new Error(`serpapi ${res.status}`);
  return parseSerpScholar(await res.json());
}
