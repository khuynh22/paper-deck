import { serverClient } from "@/lib/db/server";
import type { FeedTab, PaperRow } from "@/lib/types";

/**
 * Trending score: rewards community attention (HF upvotes, PwC stars) decayed by
 * recency so fresh-and-discussed papers rank above old-but-popular ones.
 */
export function trendingScore(
  p: { hf_upvotes: number; pwc_stars: number; published_at: string | null },
  now: number,
): number {
  const ageDays = p.published_at ? (now - Date.parse(p.published_at)) / 86_400_000 : 3650;
  const recency = Math.exp(-Math.max(ageDays, 0) / 14); // ~2-week decay
  const attention = p.hf_upvotes * 3 + Math.log1p(p.pwc_stars) * 5;
  return attention * (0.3 + recency);
}

/** Fetch a feed view over the shared corpus. */
export async function getFeed(tab: FeedTab, limit = 40): Promise<PaperRow[]> {
  const db = await serverClient();
  let q = db.from("papers").select("*").limit(limit);

  if (tab === "latest") {
    q = q.order("published_at", { ascending: false, nullsFirst: false });
  } else if (tab === "famous") {
    q = q.order("citations", { ascending: false });
  } else {
    // Pull a generous candidate set ordered by raw attention, then rerank by score.
    q = q.order("hf_upvotes", { ascending: false }).order("pwc_stars", { ascending: false });
  }

  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as PaperRow[];

  if (tab === "trending") {
    const now = Date.now();
    return [...rows].sort((a, b) => trendingScore(b, now) - trendingScore(a, now));
  }
  return rows;
}

/** Fetch a single paper by id. */
export async function getPaper(id: string): Promise<PaperRow | null> {
  const db = await serverClient();
  const { data, error } = await db.from("papers").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as PaperRow) ?? null;
}
