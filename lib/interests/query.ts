import { serverClient } from "@/lib/db/server";
import { PAGE_SIZE } from "@/lib/corpus/discovery";
import type { Interest } from "./params";
import type { PaperRow } from "@/lib/types";
export type InterestUpdate = {
  paper: PaperRow;
  reasons: {
    id: string;
    name: string;
    query: string;
    topic: string;
    venue: string;
    author: string;
    from: string | null;
    to: string | null;
  }[];
  is_new: boolean;
  matched_at: string;
};
export async function getInterests(): Promise<Interest[]> {
  const db = await serverClient();
  const result: Interest[] = [];
  let after: string | undefined;
  for (;;) {
    let query = db
      .from("research_interests")
      .select("*")
      .order("id")
      .limit(500);
    if (after) query = query.gt("id", after);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    result.push(
      ...data.map((r) => ({
        id: r.id,
        name: r.name,
        q: r.query_text,
        topic: r.topic,
        venue: r.venue,
        author: r.author_name,
        from: r.from_date ?? "",
        to: r.to_date ?? "",
        paused: r.paused,
        lastSeenAt: r.last_seen_at,
      })),
    );
    after = data.at(-1)!.id;
  }
  return result;
}
export async function getInterestUpdates(asOf: string, page: number) {
  const db = await serverClient();
  const { data, error } = await db.rpc("interest_updates", {
    as_of: asOf,
    page_limit: PAGE_SIZE + 1,
    page_offset: (page - 1) * PAGE_SIZE,
  });
  if (error) throw error;
  const rows = (data ?? []) as InterestUpdate[];
  return {
    updates: rows.slice(0, PAGE_SIZE),
    hasMore: rows.length > PAGE_SIZE,
  };
}
