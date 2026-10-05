import { serviceClient } from "@/lib/db/service";
import { aggregate, type SourceOutcome } from "@/lib/sources";
import { upsertPapers, type IngestionResult } from "@/lib/corpus/upsert";

export type RefreshStatus = "healthy" | "partial" | "failed";
export interface RefreshResult {
  runId: string | null;
  status: RefreshStatus | "busy" | "cooldown";
  ingestion: IngestionResult;
  errors: { id: string; error: string }[];
}
const emptyCounts = (): IngestionResult => ({ inserted: 0, updated: 0, skipped: 0, failed: 0 });

export function refreshStatus(outcomes: SourceOutcome[], failedRecords: number): RefreshStatus {
  if (!outcomes.length || outcomes.every(source => source.status === "failed")) return "failed";
  return failedRecords || outcomes.some(source => source.status !== "healthy") ? "partial" : "healthy";
}

/** Callers authenticate owner/cron before entering this service-role workflow. */
export async function runRefresh(kind: "manual" | "cron"): Promise<RefreshResult> {
  const db = serviceClient();
  const claim = await db.rpc("begin_refresh", { kind }).abortSignal(AbortSignal.timeout(5_000));
  if (claim.error || !claim.data?.[0]) throw new Error("Could not start refresh.");
  const { run_id: runId, reason } = claim.data[0];
  if (!runId) {
    if (reason !== "busy" && reason !== "cooldown") throw new Error("Invalid refresh claim.");
    return { runId: null, status: reason, ingestion: emptyCounts(), errors: [] };
  }
  let outcomes: SourceOutcome[] = [];
  let ingestion = emptyCounts();
  let errors: RefreshResult["errors"] = [];
  let status: RefreshStatus = "failed";
  let failure: string | null = null;
  try {
    const result = await aggregate();
    outcomes = result.outcomes;
    errors = result.errors;
    ingestion = await upsertPapers(result.results, AbortSignal.timeout(15_000));
    status = refreshStatus(outcomes, ingestion.failed);
    if (ingestion.failed && !ingestion.inserted && !ingestion.updated && !ingestion.skipped) status = "failed";
  } catch {
    failure = "Refresh could not complete. Check source health and retry.";
    errors.push({ id: "refresh", error: failure });
  }
  const finished = await db.rpc("finish_refresh", {
    target: runId, final_status: status, source_results: outcomes, counts: ingestion, failure,
  }).abortSignal(AbortSignal.timeout(3_000));
  if (finished.error || finished.data !== true) throw new Error("Could not confirm refresh completion.");
  // Fixed categories/counts only: suitable for log-based operational alerts.
  console.info("paperdeck.refresh", { runId, status, failedSources: outcomes.filter(s => s.status === "failed").length, failedRecords: ingestion.failed });
  return { runId, status, ingestion, errors };
}
