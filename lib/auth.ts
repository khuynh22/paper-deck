import { serverClient } from "@/lib/db/server";
import type { User } from "@supabase/supabase-js";

/** One session lookup shared by reads and mutations. Mutations inspect the error. */
export async function authenticatedUser(db: Awaited<ReturnType<typeof serverClient>>) {
  return db.auth.getUser();
}

/** The currently authenticated user, or null. Safe to call in Server Components. */
export async function currentUser(): Promise<User | null> {
  const db = await serverClient();
  const { data } = await authenticatedUser(db);
  return data.user ?? null;
}
