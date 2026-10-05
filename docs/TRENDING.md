# Trending ranking and paging

Migration 0011 evaluates the existing score over the complete public corpus before
applying the result limit:

`(3 * hf_upvotes + 5 * ln(1 + pwc_stars)) * (0.3 + exp(-age_days / 14))`

Signal counts are nonnegative counts. `age_days` is elapsed time from publication
to the caller's `as_of`, floored at zero. Future publications therefore receive
the same recency factor as publications at `as_of`. Missing dates use 3,650 days.
Zero signals produce zero score. The SQL caps very old ages at 10,000 days to
avoid floating-point exponential underflow; at that age the recency contribution
is already below double-precision significance when added to 0.3.

Scores descend and UUIDs ascend to break ties. The `trending_papers` RPC accepts
`as_of`, `page_limit` (1–100) and `page_offset` (0–100,000). `getFeed` validates the
window and lets callers retain one ISO timestamp across pages. This freezes time
decay, not the corpus: imports or signal updates can still change ordering. A new
feed session should choose a fresh timestamp. Latest and famous feeds also use
UUID tie-breakers. URL filter/pagination controls belong to issue #50.

Validation: `node scripts/test-ranking-db.mjs` creates and drops its own database
inside a local Supabase PostgreSQL container. Set `TEST_POSTGRES_CONTAINER` when
using a different local container. It reproduces the old top-40 exclusion with 50
papers, compares the complete SQL ordering with the unchanged TypeScript reference
at a frozen time, and verifies paginated concatenation, null/future/ancient dates,
zero signals and ties. Browser coverage demonstrates the excluded fresh paper is
now visible on the trending feed.

A synthetic 50,000-row corpus on local PostgreSQL 17 returned 40 rows in 50.6 ms
with 1,973 shared buffer hits, one read and no temporary writes. The actual RPC
plan is emitted by the regression script and CI. No new index was justified:
ranking depends on the requested time and both signals, so the existing raw-signal
indexes cannot establish the score order. This is a local measurement, not a
production latency guarantee.
