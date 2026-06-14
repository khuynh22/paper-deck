-- reading_progress: track read DEPTH separately from resume position.
--
-- `scroll_pct` (+ `block_anchor`) is where the reader left off, used to scroll
-- them back. `read_pct` is the deepest scroll fraction they ever reached — a
-- monotonic value that drives the HTML reader's left-margin read rail, the
-- "% read" shown on the feed/library/shelf, and done detection. They differ:
-- scrolling back up lowers scroll_pct but never read_pct.
alter table reading_progress add column if not exists read_pct real not null default 0;
