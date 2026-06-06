import { serverClient } from "@/lib/db/server";
import type { User } from "@supabase/supabase-js";

/** The currently authenticated user, or null. Safe to call in Server Components. */
export async function currentUser(): Promise<User | null> {
  const db = await serverClient();
  const { data } = await db.auth.getUser();
  return data.user ?? null;
}
