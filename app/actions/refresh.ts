"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { isOwner } from "@/lib/env";
import { aggregate } from "@/lib/sources";
import { upsertPapers } from "@/lib/corpus/upsert";

export interface RefreshResult {
  upserted: number;
  errors: { id: string; error: string }[];
}

/** Owner-only manual corpus refresh. */
export async function triggerRefresh(): Promise<RefreshResult> {
  const user = await currentUser();
  if (!isOwner(user?.email)) throw new Error("owner only");

  const { results, errors } = await aggregate();
  const upserted = await upsertPapers(results);
  revalidatePath("/feed");
  return { upserted, errors };
}
