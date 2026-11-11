import type { SupabaseClient } from "@supabase/supabase-js";

/** Redirects are public corpus identity only; user state still uses RLS. */
export async function resolvePaperId(db: SupabaseClient, id: string): Promise<string> {
  const { data, error } = await db.from("paper_redirects").select("canonical_id").eq("paper_id", id).maybeSingle();
  if (error) throw new Error(`Paper identity lookup failed: ${error.message}`);
  return (data?.canonical_id as string | undefined) ?? id;
}
