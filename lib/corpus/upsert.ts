import { serviceClient } from "@/lib/db/service";
import { dedupe } from "@/lib/corpus/dedupe";
import type { NormalizedPaper } from "@/lib/types";

/** Map a normalized paper to a `papers` table row. */
export function toPaperRow(p: NormalizedPaper) {
  return {
    arxiv_id: p.arxivId,
    doi: p.doi,
    title: p.title,
    authors: p.authors,
    abstract: p.abstract,
    categories: p.categories,
    html_url: p.htmlUrl,
    pdf_url: p.pdfUrl,
    source_url: p.sourceUrl,
    published_at: p.publishedAt,
    hf_upvotes: p.signals.hfUpvotes ?? 0,
    pwc_stars: p.signals.pwcStars ?? 0,
    citations: p.signals.citations ?? 0,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Upsert papers into the shared corpus, deduplicated. Rows with an arxiv_id are
 * conflict-resolved on that key; rows without one are inserted (best-effort).
 */
export async function upsertPapers(papers: NormalizedPaper[]): Promise<number> {
  const deduped = dedupe(papers);
  if (deduped.length === 0) return 0;

  const db = serviceClient();
  const withArxiv = deduped.filter((p) => p.arxivId).map(toPaperRow);
  const withoutArxiv = deduped.filter((p) => !p.arxivId).map(toPaperRow);

  if (withArxiv.length) {
    const { error } = await db
      .from("papers")
      .upsert(withArxiv, { onConflict: "arxiv_id", ignoreDuplicates: false });
    if (error) throw error;
  }
  if (withoutArxiv.length) {
    // No reliable unique key; insert and ignore duplicates by DOI uniqueness if present.
    const { error } = await db.from("papers").insert(withoutArxiv);
    if (error && error.code !== "23505") throw error; // ignore unique violations
  }

  return deduped.length;
}
