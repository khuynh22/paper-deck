"use server";
import { revalidatePath } from "next/cache";
import { withMutation } from "@/lib/db/mutation";
import { mutationFailure, type MutationResult } from "@/lib/mutationResult";
import { isUuid } from "@/lib/library/params";
import {
  validateInterest,
  type InterestCriteria,
} from "@/lib/interests/params";
import { extractArxivId } from "@/lib/sources/arxiv";
const invalid = (): MutationResult => ({
  ok: false,
  code: "validation",
  message: "Enter a name and at least one valid interest criterion.",
});
export async function saveInterest(
  id: string,
  name: string,
  criteria: InterestCriteria,
  create: boolean,
): Promise<MutationResult> {
  const parsed = validateInterest(name, criteria);
  if (!isUuid(id) || !parsed || typeof create !== "boolean") return invalid();
  const c = parsed.criteria;
  const row = {
    name: parsed.name,
    query_text: c.q,
    topic: c.topic,
    venue: c.venue,
    author_name: c.author,
    from_date: c.from || null,
    to_date: c.to || null,
    exact_arxiv: extractArxivId(c.q),
  };
  return withMutation(async (db, userId) => {
    // Upsert only these fields: retries never reset pause state or the checkpoint.
    const result = create
      ? await db
          .from("research_interests")
          .upsert({ id, user_id: userId, ...row }, { onConflict: "id" })
          .select("id")
          .single()
      : await db
          .from("research_interests")
          .update(row)
          .eq("id", id)
          .eq("user_id", userId)
          .select("id")
          .single();
    if (result.error || !result.data) return mutationFailure(result.error);
    revalidatePath("/updates");
    return { ok: true, data: undefined };
  });
}
export async function pauseInterest(
  id: string,
  paused: boolean,
): Promise<MutationResult> {
  if (!isUuid(id) || typeof paused !== "boolean") return invalid();
  return withMutation(async (db, userId) => {
    const { data, error } = await db
      .from("research_interests")
      .update({ paused })
      .eq("id", id)
      .eq("user_id", userId)
      .select("id")
      .single();
    if (error || !data) return mutationFailure(error);
    revalidatePath("/updates");
    return { ok: true, data: undefined };
  });
}
export async function deleteInterest(id: string): Promise<MutationResult> {
  if (!isUuid(id)) return invalid();
  return withMutation(async (db, userId) => {
    const { error } = await db
      .from("research_interests")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) return mutationFailure(error);
    revalidatePath("/updates");
    return { ok: true, data: undefined };
  });
}
export async function checkInterests(): Promise<MutationResult<string>> {
  return withMutation(async (db) => {
    const { data, error } = await db.rpc("check_interest_matches");
    if (error || typeof data !== "string") return mutationFailure(error);
    revalidatePath("/updates");
    return { ok: true, data };
  });
}
export async function markInterestsSeen(
  through: string,
): Promise<MutationResult> {
  if (typeof through !== "string" || !Number.isFinite(Date.parse(through)))
    return invalid();
  return withMutation(async (db) => {
    const { error } = await db.rpc("mark_interest_updates_seen", {
      through_time: through,
    });
    if (error) return mutationFailure(error);
    revalidatePath("/updates");
    return { ok: true, data: undefined };
  });
}
