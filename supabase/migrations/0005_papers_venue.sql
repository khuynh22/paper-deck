-- Add a conference venue label (e.g. "NeurIPS 2024") to the shared corpus.
-- Nullable and additive: populated by the conferences source and merged onto
-- matching arXiv rows; existing rows stay NULL and backfill as the cron re-ingests.
alter table papers add column if not exists venue text;
