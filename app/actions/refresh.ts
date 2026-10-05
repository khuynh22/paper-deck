"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { isOwner } from "@/lib/env";
import { runRefresh, type RefreshResult } from "@/lib/corpus/refresh";

/** Owner-only manual corpus refresh. */
export async function triggerRefresh(): Promise<RefreshResult> {
  const user = await currentUser();
  if (!isOwner(user?.email)) throw new Error("owner only");

  const result = await runRefresh("manual");
  revalidatePath("/");
  revalidatePath("/feed");
  return result;
}
