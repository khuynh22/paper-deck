import { z } from "zod";
import type { Highlight } from "@/lib/types";

export const NOTE_MAX = 2000;
export const QUOTE_MAX = 1000;

/** A row of the `highlights` table as read back from Postgres. */
export interface HighlightRow {
  id: string;
  paper_id: string;
  block_anchor: string;
  start_offset: number;
  end_offset: number;
  quote: string;
  note: string | null;
}

/** The validated payload a client sends to create a highlight. */
export const highlightInputSchema = z
  .object({
    paperId: z.string().min(1),
    blockAnchor: z.string().min(1),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    quote: z.string().min(1).max(QUOTE_MAX),
    note: z.string().max(NOTE_MAX).nullable().optional(),
  })
  .refine((v) => v.endOffset > v.startOffset, {
    message: "endOffset must be greater than startOffset",
    path: ["endOffset"],
  });

export type HighlightInput = z.infer<typeof highlightInputSchema>;

/** Map a DB row to the app-facing Highlight shape. */
export function rowToHighlight(row: HighlightRow): Highlight {
  return {
    id: row.id,
    paperId: row.paper_id,
    blockAnchor: row.block_anchor,
    startOffset: row.start_offset,
    endOffset: row.end_offset,
    quote: row.quote,
    note: row.note,
  };
}

/** Build the insert payload for a new highlight row. */
export function highlightInsert(userId: string, input: HighlightInput) {
  return {
    user_id: userId,
    paper_id: input.paperId,
    block_anchor: input.blockAnchor,
    start_offset: input.startOffset,
    end_offset: input.endOffset,
    quote: input.quote,
    note: input.note ?? null,
  };
}
