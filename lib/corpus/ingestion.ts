export const INGESTION_BATCH_SIZE = 100;

export interface IngestionResult {
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  unconfirmed: number;
}

export function formatIngestion(counts: IngestionResult, empty = "No papers found."): string {
  if (!Object.values(counts).some(Boolean)) return empty;
  const uncertain = counts.unconfirmed ? `, ${counts.unconfirmed} unconfirmed; retry to confirm` : "";
  return `${counts.inserted} added, ${counts.updated} updated, ${counts.skipped} unchanged or skipped, ${counts.failed} failed${uncertain}.`;
}
