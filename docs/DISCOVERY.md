# Discovery filters and pages

Feed (`/`) and search (`/search`) share URL parameters: `topic` is an exact
category such as `cs.AI`; `venue` is an exact, case-insensitive venue; `from` and
`to` are inclusive UTC publication dates in YYYY-MM-DD format. Missing publication
dates are excluded when a date filter is active. Search uses `q`; feed ordering
uses `tab=latest|trending|famous`. A pasted arXiv ID/URL still performs an exact ID
lookup with the selected filters applied.

Pages display 40 papers. SQL requests one extra row to determine whether a next
page exists; the displayed count is not presented as the corpus total. Links
carry `page` and an ISO UTC `asof` timestamp. Every order ends with ascending UUID;
search preserves relevance, then publication-date order. Trending uses the policy
in TRENDING.md, frozen at `asof`. An unchanged corpus has no duplicates or omissions
between pages. Imports/updates can change the corpus during browsing; this is not
a historical database snapshot.

Filter/query submissions and order changes reset the page. Reload and browser Back
retain the URL selection. Invalid or repeated values, impossible/inverted dates,
invalid timestamps and out-of-range page numbers reset safely with a visible
message. Direct page numbers above one require an `asof` value. Page 2501 is the
bounded offset limit; the UI asks for narrower filters if more results remain.
Topic/venue/query lengths are bounded and all database values are RPC parameters.

Migration 0012 adds `discover_papers` (security invoker over the public corpus) and
shares the same score helper with the existing trending RPC. Selective venue
filtering on a synthetic 50,000-row PostgreSQL 17 corpus improved from 2.8 ms / 8,444
buffer hits to 1.0 ms / 506 hits using an index on lower(venue). A candidate category
GIN index was not chosen by the representative top-page plan, so it is not added.
Existing publication and full-text indexes remain in use. These are local samples,
not production latency guarantees. `scripts/test-ranking-db.mjs` emits the plans
and runs the SQL discovery assertions in a database it creates and drops.

Tests cover more than 40 tied rows in all four orders, independent and combined
filters, relevance weighting, inclusive date boundaries, exact IDs, empty results,
URL validation, desktop/mobile paging, and Back/reload restoration.
