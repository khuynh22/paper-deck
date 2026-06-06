"use server";

import { revalidatePath } from "next/cache";
import { serverClient } from "@/lib/db/server";
import { currentUser } from "@/lib/auth";
import { nextStarState } from "@/lib/star";

/** Toggle a star for the current user. Returns the new starred state. */
export async function toggleStar(paperId: string, currentlyStarred: boolean): Promise<boolean> {
  const user = await currentUser();
  if (!user) throw new Error("auth required");
  const db = await serverClient();
  const next = nextStarState(currentlyStarred);

  if (next) {
    await db.from("stars").upsert(
      { user_id: user.id, paper_id: paperId },
      { onConflict: "user_id,paper_id" },
    );
  } else {
    await db.from("stars").delete().eq("user_id", user.id).eq("paper_id", paperId);
  }

  revalidatePath("/feed");
  revalidatePath("/library");
  return next;
}
