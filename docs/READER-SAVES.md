# Reader save behavior

Progress, highlight creation, note edits, and highlight deletion report success
only after the server acknowledges the database operation. Authentication errors
ask the user to sign in in another tab and then retry, preserving the current
reader and its local edits. Storage/transport failures show Retry; validation
failures explain what needs to change. Database details are not exposed.

## Ordering and retries

- HTML and PDF progress use a per-mounted-reader queue. Scroll snapshots are
  captured immediately and debounced for 600 ms. Block/page geometry is
  measured at most once per 250 ms during scroll. Mark/clear requests flush
  immediately. Only one write is in flight; later partial updates are merged.
- If a write fails, its fields are merged back under newer pending fields. For
  example, a later clear beats an earlier failed mark, while a scroll-only update
  retains a failed mark. Background autosaves pause until explicit Retry or a new Mark/Clear; scrolling updates
  the retained snapshot without producing a retry loop.
- The local mark remains a visibly dashed, faded preview while its explicit save
  is pending or failed. PDF page badges say "unsaved" rather than "read". The
  normal tint and badge appear only after the server acknowledges the mark.
  A mounted status region announces Saving/Saved to screen readers.
  Scroll-only saves stay quiet unless they fail. Mark/Clear shows Saving and
  briefly shows Saved only when the latest queued snapshot is acknowledged.
- A note remains editable during a save, but other mutations are disabled. An
  older acknowledgement cannot close the editor or mark newer text as saved.
  Failed notes retain their text; failed deletion retains the highlight/editor.
  Cancel explicitly discards the local draft. Finish or cancel the editor before
  selecting another highlight.
- Each highlight selection gets one UUID, retained through all creation retries.
  The server inserts that UUID and, on a duplicate, reads only the current user's
  matching highlight. It never upserts over a note edited after the first insert.
  This also handles a committed insert whose acknowledgement was lost. The
  same ID is retained if a failed creation is cancelled and its passage is
  reselected while the reader stays mounted. An overlapping but different
  selection is held until the uncertain original is retried, preventing nested
  marks after a lost response. IDs use Web Crypto random bytes,
  which are available on plain HTTP LAN origins.

## Navigation and lifecycle

- Ordinary links that would leave the reader ask for confirmation while changes
  are unsaved. Reload/close use the browser's native unsaved-changes warning.
  Sign-in links open in a new tab so the draft remains mounted.
- When the document becomes hidden or a reader unmounts during SPA navigation,
  pending non-failed progress is flushed using the last captured snapshot. Failed
  writes remain paused; they are not silently retried during teardown.
- Unmount flushing is best effort, not a guarantee after the browser terminates.
  Browser history navigation and programmatic routing cannot reliably be blocked
  by these link handlers. Unsubmitted notes and failed drafts are held only in
  memory and are discarded if the user leaves/unmounts the reader. Wait for Saved
  before leaving when persistence matters. There is no offline outbox.
- Queues serialize changes within a reader session. Separate devices/tabs still
  use the existing database last-write-wins policy; this is not collaborative
  conflict resolution.

## Verification

Regression tests cover database/auth/transport errors, zero-row note updates,
idempotent creation, retained drafts and deletion, slow acknowledgements,
mark/clear ordering, failed-mark + scroll merging, HTML/PDF unmount flushing,
and navigation warnings. Run the repository's test, typecheck, lint, and build
scripts before merging.

Browser verification against local Supabase uses a temporary user and cached HTML
fixture, then checks actual database rows: acknowledged progress, a committed
highlight with its response deliberately dropped followed by retry, note and
delete failure/retry, reload, and a second mobile-sized browser context. The
persistent CI browser harness is tracked separately in issue #48.

### Local browser evidence (2026-10-05)

The development app was exercised in Chromium against local Supabase with a
temporary authenticated user and HTML paper. Network responses were deliberately
dropped for the marked boundary, highlight creation, note update, and deletion.
The run reported:

```text
PASS: ordinary scroll does not prompt on navigation
PASS: failed mark is visibly unsaved until retry is acknowledged
PASS: acknowledged HTML progress persisted in local Supabase
PASS: lost creation response + retry leaves exactly one highlight
PASS: note failure retains draft; retry persists it
PASS: reload and a second mobile browser context restore mark and note
PASS: failed deletion retains highlight until retry succeeds
PASS: no uncaught browser errors
```

The browser check is local evidence for issue #45; the automated cross-context
harness remains tracked in #48.
