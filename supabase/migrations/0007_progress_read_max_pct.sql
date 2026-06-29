-- reading_progress: the DEEPEST read depth ever reached (monotonic max of read_pct).
--
-- Distinct from `read_pct` (the CURRENT viewport-bottom fraction, which rises and
-- falls with scrolling and drives the reversible rail/status). `read_max_pct` only
-- ever increases, so it can back a sticky "I read this" tint that doesn't retreat
-- when the reader scrolls back up. Additive and safe; existing rows default to 0
-- (no tint until a paper is re-read to the end).
alter table reading_progress add column if not exists read_max_pct real not null default 0;
