# My Notes

`/notes` requires authentication and lists the current user's highlights, including highlights with no note. Search is a literal case-insensitive substring across quote, note and paper title; it can be combined with a paper filter. The server orders by most recently updated, then UUID, and requests 41 rows for each 40-row page. Changes between requests can move edited notes between pages; pagination is not a historical snapshot. Paper options and reader highlights are fetched in batches to avoid the default 1,000-row cutoff.

Migration `0014_my_notes.sql` uses security-invoker functions, existing highlight RLS and `auth.uid()`. Anonymous execution is revoked. Neither function accepts a user ID. Run migrations through the normal release process; this work does not apply hosted migrations.

Open passage links carry a highlight ID. The reader uses only the signed-in user's highlights and paints a target only when its block, offsets and exact quote still agree. A verified mark is scrolled into view and focused. Missing, changed, deleted or unavailable-source passages show an explicit fallback with the saved quote and note when still owned. They do not resume to an unrelated saved position. PDF targets validate their document identity, page and exact text before focusing the normalized geometry; unavailable or changed PDFs use the same fallback.

Edits and deletes reuse the acknowledged reader actions, retain failed drafts, offer retry and invalidate notes/reader caches. A newer draft typed during an older save remains editable. Deleting a highlight also deletes its note, but never the paper or reading progress.

Validation covers SQL ownership/search/stable paging, malformed URLs, exact/drifted passage resolution, failed edits/deletes/newer drafts, and desktop/mobile authenticated browser saves with a deliberately lost committed response. Run the browser suite using `docs/BROWSER-TESTS.md` and SQL checks with `node scripts/test-ranking-db.mjs`.
