import type { NormalizedPaper } from "@/lib/types";

/** Stable key for deduplicating the same paper across sources. */
export function dedupeKey(p: NormalizedPaper): string {
  if (p.arxivId?.trim()) return `arxiv:${p.arxivId.trim()}`;
  if (p.doi?.trim()) return `doi:${p.doi.trim().toLowerCase()}`;
  return `title:${p.title.toLowerCase().trim().replace(/\s+/g, " ")}`;
}

function maxSignal(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.max(a, b);
}

/**
 * Merge duplicate papers into one, keeping the richest metadata and the strongest
 * signal from each source (HF upvotes, PwC stars, citations).
 */
export function dedupe(papers: NormalizedPaper[]): NormalizedPaper[] {
  const groups: { paper: NormalizedPaper; dois: Set<string> }[] = [];
  for (const input of papers) {
    const p = {
      ...input,
      arxivId: input.arxivId?.trim() || null,
      doi: input.doi?.trim().toLowerCase() || null,
      authors: input.authors.map(author => author.trim()).filter(Boolean),
      abstract: input.abstract?.trim() || null,
      htmlUrl: input.htmlUrl?.trim() || null,
      pdfUrl: input.pdfUrl?.trim() || null,
      sourceUrl: input.sourceUrl?.trim() || null,
      venue: input.venue?.trim() || null,
    };
    const matches = groups.filter(({ paper, dois }) =>
      (p.arxivId && p.arxivId === paper.arxivId) ||
      (p.doi && dois.has(p.doi)) ||
      (!p.arxivId && !p.doi && !paper.arxivId && !paper.doi && p.title.trim() && dedupeKey(p) === dedupeKey(paper)),
    );
    const arxivIds = new Set([p.arxivId, ...matches.map(g => g.paper.arxivId)].filter(Boolean));
    const journalDois = new Set([p.doi, ...matches.flatMap(g => [...g.dois])].filter(doi => doi && !doi.startsWith("10.48550/arxiv.")));
    if (!matches.length || arxivIds.size > 1 || journalDois.size > 1) {
      groups.push({ paper: { ...p, authors: [...p.authors], categories: [...p.categories], signals: { ...p.signals } }, dois: new Set(p.doi ? [p.doi] : []) });
      continue;
    }
    const target = matches[0];
    for (const group of matches.slice(1)) {
      target.paper = merge(target.paper, group.paper);
      group.dois.forEach(doi => target.dois.add(doi));
      groups.splice(groups.indexOf(group), 1);
    }
    target.paper = merge(target.paper, p);
    if (p.doi) target.dois.add(p.doi);
  }
  return groups.map(g => g.paper);
}

function merge(cur: NormalizedPaper, p: NormalizedPaper): NormalizedPaper {
  const yearOnly = (date: string | null) => !!date && /^\d{4}-01-01T00:00:00(?:\.000)?(?:Z|\+00:00)$/.test(date);
  return {
      ...cur,
      arxivId: cur.arxivId ?? p.arxivId,
      doi: cur.doi?.startsWith("10.48550/arxiv.") && p.doi && !p.doi.startsWith("10.48550/arxiv.") ? p.doi : cur.doi ?? p.doi,
      title: cur.title.trim() ? cur.title : p.title,
      authors: p.authors.length > cur.authors.length ? [...p.authors] : cur.authors,
      abstract: cur.abstract ?? p.abstract,
      htmlUrl: cur.htmlUrl ?? p.htmlUrl,
      pdfUrl: cur.pdfUrl ?? p.pdfUrl,
      sourceUrl: cur.sourceUrl ?? p.sourceUrl,
      publishedAt: !cur.publishedAt || (yearOnly(cur.publishedAt) && p.publishedAt && !yearOnly(p.publishedAt)) ? p.publishedAt : cur.publishedAt,
      venue: cur.venue ?? p.venue,
      categories: Array.from(new Set([...cur.categories, ...p.categories])),
      signals: {
        hfUpvotes: maxSignal(cur.signals.hfUpvotes, p.signals.hfUpvotes),
        pwcStars: maxSignal(cur.signals.pwcStars, p.signals.pwcStars),
        citations: maxSignal(cur.signals.citations, p.signals.citations),
      },
  };
}
