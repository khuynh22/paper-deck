"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { searchArxiv } from "@/lib/sources/arxiv";
import { upsertPapers } from "@/lib/corpus/upsert";

export interface ArxivSearchResult {
  /** How many arXiv matches were merged into the corpus. */
  added: number;
  error: string | null;
}

/**
 * Pull fresh arXiv matches into the shared corpus. Gated to signed-in users: it
 * writes to the world-shared corpus via the service role, so it must not be
 * reachable by anonymous traffic (Server Actions are callable via direct POST).
 */
export async function searchArxivAction(query: string): Promise<ArxivSearchResult> {
  const q = query.trim();
  if (!q) return { added: 0, error: null };

  const user = await currentUser();
  if (!user) return { added: 0, error: "Sign in to pull new papers from arXiv." };

  try {
    const found = await searchArxiv(q);
    const added = await upsertPapers(found);
    revalidatePath("/search");
    return { added, error: null };
  } catch (e) {
    return { added: 0, error: e instanceof Error ? e.message : "arXiv search failed" };
  }
}
