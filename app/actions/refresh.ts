"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { isOwner } from "@/lib/env";
import { runRefresh, type RefreshResult } from "@/lib/corpus/refresh";

/** Owner-only manual corpus refresh. */
export async function triggerRefresh(): Promise<RefreshResult> {
  const user = await currentUser();
  if (!isOwner(user?.email)) throw new Error("owner only");

  try {
    return await runRefresh("manual");
  } finally {
    revalidatePath("/");
    revalidatePath("/feed");
    revalidatePath("/search");
  }
}
