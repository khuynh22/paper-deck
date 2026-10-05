"use server";
import { revalidatePath } from "next/cache";
import { withMutation } from "@/lib/db/mutation";
import { mutationFailure, type MutationResult } from "@/lib/mutationResult";
import { isUuid, STATUS_LABELS } from "@/lib/library/params";
import { saveProgress } from "./progress";
import type { ReadingStatus } from "@/lib/types";

const invalid = (): MutationResult => ({
  ok: false,
  code: "validation",
  message: "Check the name or selection and try again.",
});
function nameValid(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.trim().length > 0 &&
    name.trim().length <= 80 &&
    !/[\u0000-\u001f\u007f]/.test(name)
  );
}
function refreshed() {
  revalidatePath("/library");
  revalidatePath("/");
}
function collectionFailure(error: { code?: string } | null) {
  return error?.code === "23505"
    ? {
        ok: false as const,
        code: "validation" as const,
        message: "A collection with that name already exists.",
      }
    : mutationFailure(error);
}
export async function setLibraryStatus(
  paperId: string,
  status: ReadingStatus,
): Promise<MutationResult> {
  if (!isUuid(paperId) || !Object.hasOwn(STATUS_LABELS, status))
    return invalid();
  const result = await saveProgress(paperId, { status });
  if (result.ok) refreshed();
  return result;
}
export async function createCollection(
  id: string,
  name: string,
): Promise<MutationResult> {
  if (!isUuid(id) || !nameValid(name)) return invalid();
  return withMutation(async (db, userId) => {
    const { data, error } = await db
      .from("collections")
      .upsert({ id, user_id: userId, name: name.trim() }, { onConflict: "id" })
      .select("id")
      .single();
    if (error || !data) return collectionFailure(error);
    refreshed();
    return { ok: true, data: undefined };
  });
}
export async function renameCollection(
  id: string,
  name: string,
): Promise<MutationResult> {
  if (!isUuid(id) || !nameValid(name)) return invalid();
  return withMutation(async (db, userId) => {
    const { data, error } = await db
      .from("collections")
      .update({ name: name.trim(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .select("id")
      .single();
    if (error || !data) return collectionFailure(error);
    refreshed();
    return { ok: true, data: undefined };
  });
}
export async function deleteCollection(id: string): Promise<MutationResult> {
  if (!isUuid(id)) return invalid();
  return withMutation(async (db, userId) => {
    const { error } = await db
      .from("collections")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) return mutationFailure(error);
    refreshed();
    return { ok: true, data: undefined };
  });
}
export async function setCollectionMembership(
  collectionId: string,
  paperId: string,
  present: boolean,
): Promise<MutationResult> {
  if (!isUuid(collectionId) || !isUuid(paperId) || typeof present !== "boolean")
    return invalid();
  return withMutation(async (db, userId) => {
    const result = present
      ? await db
          .from("collection_papers")
          .upsert(
            { user_id: userId, collection_id: collectionId, paper_id: paperId },
            { onConflict: "user_id,collection_id,paper_id" },
          )
          .select("paper_id")
          .single()
      : await db
          .from("collection_papers")
          .delete()
          .eq("user_id", userId)
          .eq("collection_id", collectionId)
          .eq("paper_id", paperId);
    if (result.error || (present && !result.data))
      return mutationFailure(result.error);
    refreshed();
    return { ok: true, data: undefined };
  });
}
