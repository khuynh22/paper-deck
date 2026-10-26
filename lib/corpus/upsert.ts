import { serviceClient } from "@/lib/db/service";
import type { NormalizedPaper, PaperRow } from "@/lib/types";
import { dedupe } from "./dedupe";
import { INGESTION_BATCH_SIZE, type IngestionResult } from "./ingestion";
export type { IngestionResult } from "./ingestion";

/** Null/empty metadata means unknown; numeric zero is supplied data. */
export function toPaperRow(p: NormalizedPaper): Partial<PaperRow> {
  const row: Partial<PaperRow> = {
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
  };
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}

/** Each input gets an outcome; bad records cannot discard unrelated papers. */
export async function upsertPapers(papers: NormalizedPaper[]): Promise<IngestionResult> {
  const result: IngestionResult = { inserted: 0, updated: 0, skipped: 0, failed: 0, unconfirmed: 0 };
  if (!papers.length) return result;
  const db = serviceClient();
  const unique = dedupe(papers);
  for (let offset = 0; offset < unique.length; offset += INGESTION_BATCH_SIZE) {
    const rows = unique.slice(offset, offset + INGESTION_BATCH_SIZE).map(toPaperRow);
    try {
      const { data, error } = await db.rpc("merge_papers", { incoming: rows });
      if (error) throw new Error("Paper import RPC failed", { cause: error });
      if (!Array.isArray(data) || data.length !== rows.length ||
          new Set(data.map(row => row?.input_index)).size !== rows.length ||
          data.some(row => !row || !Number.isInteger(row.input_index) || row.input_index < 0 || row.input_index >= rows.length ||
            !["inserted", "updated", "skipped", "failed"].includes(row.outcome))) {
        throw new Error("Paper import returned invalid outcomes");
      }
      for (const row of data) result[row.outcome as Exclude<keyof IngestionResult, "unconfirmed">]++;
    } catch (error) {
      console.error("Paper import batch unconfirmed", { offset, count: rows.length, error, cause: error instanceof Error ? error.cause : undefined });
      result.unconfirmed += rows.length;
    }
  }
  return result;
}
