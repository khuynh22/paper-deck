import { currentUser } from "@/lib/auth";
import { isOwner } from "@/lib/env";
import { serviceClient } from "@/lib/db/service";
import type { SourceOutcome } from "@/lib/sources";

export function isSourceStale(lastSuccess: string | null, now = Date.now()): boolean {
  return !lastSuccess || now - Date.parse(lastSuccess) > 26 * 60 * 60 * 1000;
}

export async function getRefreshHealth() {
  const user = await currentUser();
  if (!isOwner(user?.email)) throw new Error("owner only");
  const db = serviceClient();
  const [history, health] = await Promise.all([
    db.from("refresh_runs").select("id,started_at,finished_at,status,error").order("started_at", { ascending: false }).limit(10),
    db.from("refresh_source_health").select("source_id,last_success_at,last_outcome").order("source_id"),
  ]);
  if (history.error || health.error) throw new Error("Source health is unavailable.");
  return {
    observedAt: Date.now(),
    history: history.data as { id: string; started_at: string; finished_at: string | null; status: string; error: string | null }[],
    sources: health.data as { source_id: string; last_success_at: string | null; last_outcome: SourceOutcome }[],
  };
}
