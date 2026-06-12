import { serverClient } from "@/lib/db/server";
import type { PaperRow } from "@/lib/types";

/** Set of paper ids the user has starred (for marking feed cards). */
export async function getStarredIds(userId: string): Promise<Set<string>> {
  const db = await serverClient();
  const { data, error } = await db.from("stars").select("paper_id").eq("user_id", userId);
  if (error) throw new Error(`stars query failed: ${error.message}`);
  return new Set((data ?? []).map((r) => r.paper_id as string));
}

/** The user's starred papers, newest first. */
export async function getStarredPapers(userId: string): Promise<PaperRow[]> {
  const db = await serverClient();
  const { data } = await db
    .from("stars")
    .select("created_at, papers(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data ?? [])
    .map((r) => (r as unknown as { papers: PaperRow }).papers)
    .filter(Boolean);
}

/**
 * Reading progress (0–1) for the given papers, for the feed/library list rows.
 * Only papers the user has actually opened appear in the map.
 */
export async function getProgressMap(
  userId: string,
  paperIds: string[],
): Promise<Map<string, number>> {
  if (paperIds.length === 0) return new Map();
  const db = await serverClient();
  const { data } = await db
    .from("reading_progress")
    .select("paper_id, scroll_pct")
    .eq("user_id", userId)
    .in("paper_id", paperIds);
  return new Map(
    (data ?? []).map((r) => [r.paper_id as string, (r.scroll_pct as number) ?? 0]),
  );
}

export interface ContinueItem {
  paper: PaperRow;
  scrollPct: number;
}

/** Papers the user is mid-read on ("Continue reading" shelf). */
export async function getContinueReading(userId: string, limit = 12): Promise<ContinueItem[]> {
  const db = await serverClient();
  const { data } = await db
    .from("reading_progress")
    .select("scroll_pct, updated_at, papers(*)")
    .eq("user_id", userId)
    .eq("status", "reading")
    .order("updated_at", { ascending: false })
    .limit(limit);
  return (data ?? [])
    .map((r) => {
      const row = r as unknown as { scroll_pct: number; papers: PaperRow };
      return { paper: row.papers, scrollPct: row.scroll_pct };
    })
    .filter((x) => Boolean(x.paper));
}
