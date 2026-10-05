import { serviceClient } from "@/lib/db/service";
import type { NormalizedPaper } from "@/lib/types";

/** Null/empty metadata means unknown; numeric zero is supplied data. */
export function toPaperRow(p: NormalizedPaper) {
  return Object.fromEntries(Object.entries({
    arxiv_id: p.arxivId?.trim() || undefined,
    doi: p.doi?.trim().toLowerCase() || undefined,
    title: p.title.trim() || undefined,
    authors: p.authors.length ? p.authors : undefined,
    abstract: p.abstract?.trim() || undefined,
    categories: p.categories.length ? p.categories : undefined,
    html_url: p.htmlUrl || undefined,
    pdf_url: p.pdfUrl || undefined,
    source_url: p.sourceUrl || undefined,
    published_at: p.publishedAt || undefined,
    venue: p.venue?.trim() || undefined,
    hf_upvotes: p.signals.hfUpvotes,
    pwc_stars: p.signals.pwcStars,
    citations: p.signals.citations,
  }).filter(([, value]) => value !== undefined));
}

export interface IngestionResult {
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
}

/** Each input gets an outcome; bad records cannot discard unrelated papers. */
export async function upsertPapers(papers: NormalizedPaper[], signal?: AbortSignal): Promise<IngestionResult> {
  const result: IngestionResult = { inserted: 0, updated: 0, skipped: 0, failed: 0 };
  if (!papers.length) return result;
  const db = serviceClient();
  for (let offset = 0; offset < papers.length; offset += 100) {
    const rows = papers.slice(offset, offset + 100).map(toPaperRow);
    const request = db.rpc("merge_papers", { incoming: rows });
    const { data, error } = await (signal ? request.abortSignal(signal) : request);
    if (error || !Array.isArray(data) || data.length !== rows.length) {
      throw new Error("Paper import could not be confirmed. Please retry.");
    }
    for (const row of data) {
      if (!["inserted", "updated", "skipped", "failed"].includes(row.outcome)) {
        throw new Error("Paper import returned an invalid outcome.");
      }
      result[row.outcome as keyof IngestionResult]++;
    }
  }
  return result;
}
