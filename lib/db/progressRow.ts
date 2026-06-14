import type { ReadingStatus } from "@/lib/types";

export interface ProgressUpdate {
  scrollPct?: number;
  blockAnchor?: string | null;
  markedAnchor?: string | null;
  readPct?: number;
  readerKind?: "html" | "pdf";
  status?: ReadingStatus;
}

/**
 * Build the `reading_progress` upsert payload from a partial update. Only the
 * fields present in `update` are written so that, on conflict, every unspecified
 * column keeps its existing value — including `status`, so a debounced scroll
 * save never downgrades a finished ('done') paper back to 'reading'.
 */
export function buildProgressRow(
  userId: string,
  paperId: string,
  update: ProgressUpdate,
  now: string,
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    user_id: userId,
    paper_id: paperId,
    updated_at: now,
  };
  if (update.status !== undefined) row.status = update.status;
  if (update.scrollPct !== undefined) row.scroll_pct = update.scrollPct;
  if (update.blockAnchor !== undefined) row.block_anchor = update.blockAnchor;
  if (update.markedAnchor !== undefined) row.marked_anchor = update.markedAnchor;
  if (update.readPct !== undefined) row.read_pct = update.readPct;
  if (update.readerKind !== undefined) row.reader_kind = update.readerKind;
  return row;
}
