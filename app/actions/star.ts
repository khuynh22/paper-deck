"use server";

import { revalidatePath } from "next/cache";
import { serverClient } from "@/lib/db/server";
import { currentUser } from "@/lib/auth";
import { nextStarState } from "@/lib/star";

export type ToggleStarResult =
  | { ok: true; starred: boolean }
  | { ok: false; error: "auth-required" | "save-failed" };

/**
 * Toggle a star for the current user.
 *
 * Supabase reports query failures via the `error` field of the resolved value,
 * not by throwing — so each write must be checked explicitly or a rejected
 * write (expired session, RLS) would be reported to the client as success.
 */
export async function toggleStar(
  paperId: string,
  currentlyStarred: boolean,
): Promise<ToggleStarResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "auth-required" };
  const db = await serverClient();
  const next = nextStarState(currentlyStarred);

  const { error } = next
    ? await db.from("stars").upsert(
        { user_id: user.id, paper_id: paperId },
        { onConflict: "user_id,paper_id" },
      )
    : await db.from("stars").delete().eq("user_id", user.id).eq("paper_id", paperId);

  if (error) return { ok: false, error: "save-failed" };

  revalidatePath("/feed");
  revalidatePath("/library");
  return { ok: true, starred: next };
}
