import { serverClient } from "@/lib/db/server";
import type { FeedTab, PaperRow } from "@/lib/types";
import { PAGE_SIZE, type DiscoveryParams } from "./discovery";
import { extractArxivId } from "@/lib/sources/arxiv";

export { trendingScore } from "./score";

export async function getDiscoveryPage(params: DiscoveryParams, search = false): Promise<{ papers: PaperRow[]; hasMore: boolean }> {
  const db = await serverClient();
  const { data, error } = await db.rpc("discover_papers", {
    query_text: search ? params.q : "", sort_mode: search ? "search" : params.tab,
    filter_topic: params.topic || null, filter_venue: params.venue || null,
    filter_from: params.from || null, filter_to: params.to || null,
    exact_arxiv: search ? extractArxivId(params.q) : null,
    as_of: params.asOf, page_limit: PAGE_SIZE + 1, page_offset: (params.page - 1) * PAGE_SIZE,
  });
  if (error) throw error;
  const rows = (data ?? []) as PaperRow[];
  return { papers: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
}

/** Fetch a feed view over the shared corpus. */
export async function getFeed(tab: FeedTab, limit = 40, options: { asOf?: string; offset?: number } = {}): Promise<PaperRow[]> {
  const offset = options.offset ?? 0;
  const asOf = options.asOf ?? new Date().toISOString();
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100_000 || !Number.isFinite(Date.parse(asOf))) {
    throw new RangeError("Invalid feed window");
  }
  const db = await serverClient();
  if (tab === "trending") {
    const { data, error } = await db.rpc("trending_papers", { as_of: asOf, page_limit: limit, page_offset: offset });
    if (error) throw error;
    return (data ?? []) as PaperRow[];
  }
  let q = db.from("papers").select("*").range(offset, offset + limit - 1);

  if (tab === "latest") {
    q = q.order("published_at", { ascending: false, nullsFirst: false });
  } else if (tab === "famous") {
    q = q.order("citations", { ascending: false });
  }
  q = q.order("id", { ascending: true });

  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as PaperRow[];

  return rows;
}

/**
 * Ranked full-text search over the shared corpus. Delegates to the `search_papers`
 * SQL function (migration 0002) because supabase-js cannot order by a ts_rank()
 * expression through the query builder. Returns [] for a blank query.
 */
export async function searchCorpus(query: string, limit = 40): Promise<PaperRow[]> {
  const q = query.trim();
  if (!q) return [];
  const db = await serverClient();
  const { data, error } = await db.rpc("search_papers", { q, lim: limit });
  if (error) throw error;
  return (data ?? []) as PaperRow[];
}

/** Fetch a single paper by its arXiv id (for pasted ids/URLs in search). */
export async function getPaperByArxivId(arxivId: string): Promise<PaperRow | null> {
  const db = await serverClient();
  const { data, error } = await db
    .from("papers")
    .select("*")
    .eq("arxiv_id", arxivId)
    .maybeSingle();
  if (error) throw error;
  return (data as PaperRow) ?? null;
}

/** Fetch a single paper by id. */
export async function getPaper(id: string): Promise<PaperRow | null> {
  const db = await serverClient();
  const { data, error } = await db.from("papers").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as PaperRow) ?? null;
}
