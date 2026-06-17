import type { NormalizedPaper } from "@/lib/types";

/** Stable key for deduplicating the same paper across sources. */
export function dedupeKey(p: NormalizedPaper): string {
  if (p.arxivId) return `arxiv:${p.arxivId}`;
  if (p.doi) return `doi:${p.doi}`;
  return `title:${p.title.toLowerCase().trim().replace(/\s+/g, " ")}`;
}

function maxSignal(a: number | undefined, b: number | undefined): number | undefined {
  const v = Math.max(a ?? 0, b ?? 0);
  return v > 0 ? v : undefined;
}

/**
 * Merge duplicate papers into one, keeping the richest metadata and the strongest
 * signal from each source (HF upvotes, PwC stars, citations).
 */
export function dedupe(papers: NormalizedPaper[]): NormalizedPaper[] {
  const map = new Map<string, NormalizedPaper>();

  for (const p of papers) {
    const key = dedupeKey(p);
    const cur = map.get(key);
    if (!cur) {
      map.set(key, { ...p, categories: [...p.categories], signals: { ...p.signals } });
      continue;
    }
    map.set(key, {
      ...cur,
      arxivId: cur.arxivId ?? p.arxivId,
      doi: cur.doi ?? p.doi,
      abstract: cur.abstract ?? p.abstract,
      htmlUrl: cur.htmlUrl ?? p.htmlUrl,
      pdfUrl: cur.pdfUrl ?? p.pdfUrl,
      sourceUrl: cur.sourceUrl ?? p.sourceUrl,
      publishedAt: cur.publishedAt ?? p.publishedAt,
      venue: cur.venue ?? p.venue,
      categories: Array.from(new Set([...cur.categories, ...p.categories])),
      signals: {
        hfUpvotes: maxSignal(cur.signals.hfUpvotes, p.signals.hfUpvotes),
        pwcStars: maxSignal(cur.signals.pwcStars, p.signals.pwcStars),
        citations: maxSignal(cur.signals.citations, p.signals.citations),
      },
    });
  }

  return [...map.values()];
}
