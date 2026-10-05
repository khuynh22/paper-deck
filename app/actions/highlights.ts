"use server";

import { z } from "zod";
import { withMutation } from "@/lib/db/mutation";
import { highlightNotFound, mutationFailure, type MutationResult } from "@/lib/mutationResult";
import { serverClient } from "@/lib/db/server";
import { currentUser } from "@/lib/auth";
import type { Highlight } from "@/lib/types";
import {
  highlightInputSchema,
  highlightInsert,
  rowToHighlight,
  NOTE_MAX,
  QUOTE_MAX,
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

/** A stable client-generated id makes retries after a lost response idempotent. */
export async function createHighlight(input: HighlightInput, requestId: string): Promise<MutationResult<Highlight>> {
  const parsed = highlightInputSchema.safeParse(input);
  if (!z.uuid().safeParse(requestId).success) {
    return { ok: false, code: "validation", message: "Selection changed. Select the passage again." };
  }
  if (!parsed.success) {
    return { ok: false, code: "validation", message: input.quote?.length > QUOTE_MAX
      ? "Select a shorter passage and try again." : "Selection changed. Select the passage again." };
  }
  return withMutation(async (db, userId) => {
    const { data, error } = await db.from("highlights")
      .insert({ ...highlightInsert(userId, parsed.data), id: requestId })
      .select(HL_COLS).single();
    if (!error && data) return { ok: true, data: rowToHighlight(data as HighlightRow) };
    if (error?.code !== "23505") return mutationFailure(error);

    // An earlier attempt may have committed even though its response was lost.
    // Read only this user's row; never upsert over a subsequently edited note.
    const existing = await db.from("highlights").select(HL_COLS)
      .eq("id", requestId).eq("user_id", userId).maybeSingle();
    if (existing.error) return mutationFailure(existing.error);
    if (!existing.data) return highlightNotFound;
    const h = rowToHighlight(existing.data as HighlightRow);
    if (h.paperId !== parsed.data.paperId || h.blockAnchor !== parsed.data.blockAnchor ||
        h.startOffset !== parsed.data.startOffset || h.endOffset !== parsed.data.endOffset ||
        h.quote !== parsed.data.quote) return highlightNotFound;
    return { ok: true, data: h };
  });
}

/** Set (or clear) the note; a zero-row update is not a successful save. */
export async function updateHighlightNote(id: string, note: string | null): Promise<MutationResult> {
  if (!z.uuid().safeParse(id).success) return highlightNotFound;
  if (note !== null && (typeof note !== "string" || note.length > NOTE_MAX)) {
    return { ok: false, code: "validation", message: `Notes must be ${NOTE_MAX} characters or fewer.` };
  }
  return withMutation(async (db, userId) => {
    const { data, error } = await db.from("highlights")
      .update({ note, updated_at: new Date().toISOString() })
      .eq("id", id).eq("user_id", userId).select("id").maybeSingle();
    if (error) return error.code === "22P02" ? highlightNotFound : mutationFailure(error);
    if (!data) return highlightNotFound;
    return { ok: true, data: undefined };
  });
}

/** Deletes are idempotent: an already absent row is a successful retry. */
export async function deleteHighlight(id: string): Promise<MutationResult> {
  if (!z.uuid().safeParse(id).success) return highlightNotFound;
  return withMutation(async (db, userId) => {
    const { error } = await db.from("highlights").delete().eq("id", id).eq("user_id", userId);
    if (error) return mutationFailure(error);
    return { ok: true, data: undefined };
  });
}
