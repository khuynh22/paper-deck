"use server";

import { serverClient } from "@/lib/db/server";
import { currentUser } from "@/lib/auth";
import type { Highlight } from "@/lib/types";
import {
  highlightInputSchema,
  highlightInsert,
  rowToHighlight,
  NOTE_MAX,
  type HighlightInput,
  type HighlightRow,
} from "@/lib/db/highlightRow";

const HL_COLS = "id, paper_id, block_anchor, start_offset, end_offset, quote, note";

/** All of the current user's highlights for a paper (oldest first). Empty when signed out. */
export async function loadHighlights(paperId: string): Promise<Highlight[]> {
  const user = await currentUser();
  if (!user) return [];
  const db = await serverClient();
  const { data } = await db
    .from("highlights")
    .select(HL_COLS)
    .eq("user_id", user.id)
    .eq("paper_id", paperId)
    .order("created_at", { ascending: true });
  return ((data as HighlightRow[] | null) ?? []).map(rowToHighlight);
}

/** Create a highlight; returns the saved row (with id) for optimistic painting, or null. */
export async function createHighlight(input: HighlightInput): Promise<Highlight | null> {
  const user = await currentUser();
  if (!user) return null;
  const parsed = highlightInputSchema.safeParse(input);
  if (!parsed.success) return null;
  const db = await serverClient();
  const { data, error } = await db
    .from("highlights")
    .insert(highlightInsert(user.id, parsed.data))
    .select(HL_COLS)
    .single();
  if (error || !data) return null;
  return rowToHighlight(data as HighlightRow);
}

/** Set (or clear) the note on a highlight the user owns. */
export async function updateHighlightNote(id: string, note: string | null): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const capped = note && note.length > NOTE_MAX ? note.slice(0, NOTE_MAX) : note;
  const db = await serverClient();
  await db
    .from("highlights")
    .update({ note: capped ?? null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
}

/** Delete a highlight the user owns. */
export async function deleteHighlight(id: string): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const db = await serverClient();
  await db.from("highlights").delete().eq("id", id).eq("user_id", user.id);
}
