"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { searchArxiv } from "@/lib/sources/arxiv";
import { upsertPapers, type IngestionResult } from "@/lib/corpus/upsert";

export interface ArxivSearchResult {
  ingestion?: IngestionResult;
  error: string | null;
}

/**
 * Pull fresh arXiv matches into the shared corpus. Gated to signed-in users: it
 * writes to the world-shared corpus via the service role, so it must not be
 * reachable by anonymous traffic (Server Actions are callable via direct POST).
 */
export async function searchArxivAction(query: string): Promise<ArxivSearchResult> {
  const q = query.trim();
  if (!q) return { error: null };

  const user = await currentUser();
  if (!user) return { error: "Sign in to pull new papers from arXiv." };

  try {
    const found = await searchArxiv(q);
    try {
      const ingestion = await upsertPapers(found);
      return { ingestion, error: null };
    } finally {
      revalidatePath("/search");
      revalidatePath("/feed");
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "arXiv search failed" };
  }
}
