import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Service-role client (server-only). Bypasses RLS — use ONLY for trusted writes
 * to the shared corpus (cron refresh, reader HTML cache). Never import from a
 * Client Component.
 */
export function serviceClient() {
  const e = env();
  if (!e.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for corpus writes (cron refresh / reader cache).",
    );
  }
  return createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
