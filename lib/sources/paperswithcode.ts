import type { NormalizedPaper } from "@/lib/types";

interface PwcPaper {
  arxiv_id?: string | null;
  title?: string;
  abstract?: string;
  authors?: string[];
  published?: string;
  url_pdf?: string | null;
  stars?: number;
}
interface PwcResponse {
  results?: PwcPaper[];
}

/**
 * Parse a Papers With Code papers response. NOTE: as of 2026 the PwC public API
 * has been retired and redirects to an HTML page; this parser is defensive and
 * returns [] for anything that isn't the expected JSON shape.
 */
export function parsePwc(json: unknown): NormalizedPaper[] {
  const results = (json as PwcResponse)?.results;
  if (!Array.isArray(results)) return [];
  return results.map((p) => {
    const arxivId = p.arxiv_id ?? null;
    return {
      arxivId,
      doi: null,
      title: (p.title ?? "").trim(),
      authors: Array.isArray(p.authors) ? p.authors : [],
      abstract: p.abstract?.trim() || null,
      categories: [],
      htmlUrl: arxivId ? `https://arxiv.org/html/${arxivId}` : null,
      pdfUrl: p.url_pdf ?? (arxivId ? `https://arxiv.org/pdf/${arxivId}` : null),
      sourceUrl: arxivId ? `https://arxiv.org/abs/${arxivId}` : null,
      publishedAt: p.published ?? null,
      signals: typeof p.stars === "number" ? { pwcStars: p.stars } : {},
    } satisfies NormalizedPaper;
  });
}

export async function fetchPwcTrending(): Promise<NormalizedPaper[]> {
  try {
    const res = await fetch("https://paperswithcode.com/api/v1/papers/?items_per_page=50", {
      headers: { "User-Agent": "PaperDeck/1.0 (research reader)", Accept: "application/json" },
      redirect: "follow",
    });
    const contentType = res.headers.get("content-type") ?? "";
    // Retired API now serves HTML — treat as no results rather than crashing.
    if (!res.ok || !contentType.includes("application/json")) return [];
    return parsePwc(await res.json());
  } catch {
    return [];
  }
}
