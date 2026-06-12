"use server";

import { revalidatePath } from "next/cache";
import { serverClient } from "@/lib/db/server";
import { currentUser } from "@/lib/auth";
import type { ProgressRow, ReadingStatus } from "@/lib/types";

export interface ProgressUpdate {
  scrollPct?: number;
  blockAnchor?: string | null;
  markedAnchor?: string | null;
  readerKind?: "html" | "pdf";
  status?: ReadingStatus;
}

/** Load the current user's reading progress for a paper. */
export async function loadProgress(paperId: string): Promise<ProgressRow | null> {
  const user = await currentUser();
  if (!user) return null;
  const db = await serverClient();
  const { data } = await db
    .from("reading_progress")
    .select("*")
    .eq("user_id", user.id)
    .eq("paper_id", paperId)
    .maybeSingle();
  if (!data) return null;
  return {
    scrollPct: data.scroll_pct,
    blockAnchor: data.block_anchor,
    markedAnchor: data.marked_anchor,
    readerKind: data.reader_kind,
    status: data.status,
  };
}

/**
 * Persist a partial progress update (debounced by the caller). Only the provided
 * fields are written; unspecified fields keep their existing values on conflict.
 */
export async function saveProgress(paperId: string, update: ProgressUpdate): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const db = await serverClient();

  const row: Record<string, unknown> = {
    user_id: user.id,
    paper_id: paperId,
    updated_at: new Date().toISOString(),
    status: update.status ?? "reading",
  };
  if (update.scrollPct !== undefined) row.scroll_pct = update.scrollPct;
  if (update.blockAnchor !== undefined) row.block_anchor = update.blockAnchor;
  if (update.markedAnchor !== undefined) row.marked_anchor = update.markedAnchor;
  if (update.readerKind !== undefined) row.reader_kind = update.readerKind;

  await db.from("reading_progress").upsert(row, { onConflict: "user_id,paper_id" });
}

/** Remove a single paper from the user's reading history ("Continue reading" shelf). */
export async function clearProgress(paperId: string): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const db = await serverClient();
  await db.from("reading_progress").delete().eq("user_id", user.id).eq("paper_id", paperId);
  revalidatePath("/");
}

/** Clear every in-progress paper, emptying the "Continue reading" shelf. */
export async function clearAllReading(): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const db = await serverClient();
  await db.from("reading_progress").delete().eq("user_id", user.id).eq("status", "reading");
  revalidatePath("/");
}
