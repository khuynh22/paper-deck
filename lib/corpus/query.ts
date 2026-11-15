import { serverClient } from "@/lib/db/server";
import { resolvePaperId } from "@/lib/db/paperIdentity";
import type { FeedTab, PaperRow } from "@/lib/types";

export { trendingScore } from "./score";

/** Fetch a feed view over the shared corpus. */
export async function getFeed(
  tab: FeedTab,
  limit = 40,
  { asOf = new Date().toISOString(), offset = 0 }: { asOf?: string; offset?: number } = {},
): Promise<PaperRow[]> {
  if (
    !Number.isInteger(limit) || limit < 1 || limit > 100 ||
    !Number.isInteger(offset) || offset < 0 || offset > 100_000 ||
    !Number.isFinite(Date.parse(asOf))
  ) {
    throw new RangeError("Invalid feed window");
  }

  const db = await serverClient();
  if (tab === "trending") {
    const { data, error } = await db.rpc("trending_papers", {
      as_of: asOf,
      page_limit: limit,
      page_offset: offset,
    });
    if (error) throw error;
    return (data ?? []) as PaperRow[];
  }

  let q = db.from("papers").select("*").range(offset, offset + limit - 1);
  if (tab === "latest") {
    q = q.order("published_at", { ascending: false, nullsFirst: false });
  } else {
    q = q.order("citations", { ascending: false });
  }

  const { data, error } = await q.order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PaperRow[];
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
  const canonicalId = await resolvePaperId(db, id);
  const { data, error } = await db.from("papers").select("*").eq("id", canonicalId).maybeSingle();
  if (error) throw error;
  return (data as PaperRow) ?? null;
}
