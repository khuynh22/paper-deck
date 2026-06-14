# Reader & sources improvements

**Date:** 2026-06-14
**Status:** Approved (design), pending spec review
**Scope:** Three independent, small changes requested together:

1. Link the "ranked by community upvotes" feed hint to its source (Hugging Face Papers).
2. Make the HTML reader's read rail **fully reversible** (scrolling up un-marks), reversing the monotonic decision in the 2026-06-12 read-rail spec.
3. Pull papers from top conferences (NeurIPS / ICLR / ICML) via Semantic Scholar, surfaced with a venue badge.

Each section below stands on its own and can be implemented and shipped independently.

---

## 1. Link "ranked by community upvotes" → Hugging Face Papers

### Problem
The Trending feed is ranked by Hugging Face daily-papers upvotes (`hf_upvotes`, from
`https://huggingface.co/api/daily_papers`), but the hint copy "ranked by community
upvotes" (`components/FeedTabs.tsx:12`) gives no indication of where that signal
comes from. Readers can't see the source.

### Decision
Make the **Trending** hint a link to `https://huggingface.co/papers` (the Hugging
Face Daily Papers page the upvotes are sourced from). Latest and Famous hints stay
plain text — only Trending gets a link, matching the request.

### Implementation
- `components/FeedTabs.tsx`: change `HINTS` from `Record<FeedTab, string>` to
  `Record<FeedTab, { text: string; href?: string }>`:
  - `latest: { text: "freshest arXiv submissions" }`
  - `trending: { text: "ranked by community upvotes", href: "https://huggingface.co/papers" }`
  - `famous: { text: "ranked by citations" }`
- In the render, the trailing `<span>` keeps its `font-mono text-[11px] text-faint`
  styling. When the active hint has an `href`, render an
  `<a href={hint.href} target="_blank" rel="noreferrer">` with a subtle
  underline-on-hover (e.g. `hover:text-muted-foreground hover:underline`); otherwise
  render the text directly. No new dependencies.

### Testing
- Render `FeedTabs` with `active="trending"` → the hint is an anchor pointing at
  `https://huggingface.co/papers` with `target="_blank"` and `rel="noreferrer"`.
- Render with `active="latest"` / `active="famous"` → the hint is plain text, no anchor.

---

## 2. Fully reversible read rail

### Problem
The 2026-06-12 read-rail spec made read depth **monotonic** — a running session max
that only ever increases (`HtmlReader.tsx`: `if (frac > readPctRef.current)`), with an
explicitly "accepted trade-off" of **no un-mark**. In practice an accidental fling or
momentum-scroll to the bottom permanently fills the rail to 100% and marks the paper
`done`, with no way to undo it short of clearing progress. We are reversing that
decision.

### Decision
Read depth tracks the **current** viewport-bottom position, not the session max:

- Scrolling down grows the rail; scrolling up **shrinks** it.
- `status` is derived from the current depth on every save, so scrolling back above
  the `DONE_THRESHOLD` (0.98) returns the paper from `done` to `reading`.
- This makes an accidental fling fully recoverable: scroll back up and the rail, the
  "% read", and the `done` status all follow.

### Accepted trade-off (chosen during design)
Reversibility is symmetric: scrolling up to re-read an earlier section also lowers the
rail and can flip a finished paper back to `reading` (it would reappear on the
"Continue reading" shelf). This is acceptable and is the point — read state reflects
*where you currently are*, not the deepest point ever touched.

Opening a previously-finished paper is **not** affected: resume scrolls you to your
saved position (near the bottom for a finished paper), so the first scroll event keeps
it `done`. Only a deliberate scroll up un-marks it.

### Model change
The read-depth math (`lib/reader/readDepthFraction`) is **unchanged** — it already
computes the current viewport-bottom fraction; the monotonic behavior lived only in the
component. The change is to stop taking the max:

- `components/HtmlReader.tsx`, scroll handler: replace
  ```
  if (frac > readPctRef.current) { readPctRef.current = frac; setReadPct(frac); }
  ```
  with an unconditional update:
  ```
  readPctRef.current = frac;
  setReadPct(frac);
  ```
- `persist()` is otherwise unchanged: it still sends `readPct: readPctRef.current` and
  `status: isComplete(depth) ? "done" : "reading"`. Because `depth` is now the current
  fraction, `status` can move `done → reading`.
- The left rail (`style={{ height: readPct% }}`), the top `ReaderProgressBar`
  (`pct={readPct}`), and the card/shelf "% read" (`max(read_pct, scroll_pct)`) all read
  the same value and become reversible automatically. No change needed to the shelf
  query: for HTML rows `read_pct` (viewport bottom) ≥ `scroll_pct` (viewport top), so
  `max(...)` still resolves to `read_pct`; PDF rows are untouched.

### No schema change
The `read_pct` column already exists (migration `0004`). We change only the value
written, not the storage.

### Docs to correct (truthfulness)
- `lib/reader/readDepth.ts`: the file header and `DONE_THRESHOLD`/`readDepthFraction`
  comments describe a "running max … only ever increases." Rewrite to describe the
  current-depth (reversible) model.
- `components/HtmlReader.tsx`: the `readPct` comment ("Monotonic: it only grows") and
  the rail comment ("filled to the deepest scroll") must be updated.
- `docs/superpowers/specs/2026-06-12-scroll-depth-read-rail-design.md`: mark the
  "Accepted trade-off" (no un-mark) and the "Monotonic — only increases" lines in the
  Model section as **superseded by this spec (2026-06-14)**, with a one-line pointer.
  Leave the rest of that spec intact.

### Testing
- Update the `HtmlReader` jsdom test that asserts the rail only grows: it must now
  assert that a smaller scroll fraction *lowers* `readPct` (rail shrinks on scroll up).
- Assert a scroll to ≥ 0.98 then back above the threshold persists `status: "reading"`
  on the later save (done un-marks).
- `readDepthFraction` unit tests are unchanged (pure function, same behavior).

---

## 3. Conference sources (NeurIPS / ICLR / ICML) + venue badge

### Problem
The corpus pulls from arXiv, Hugging Face, and Semantic Scholar, but nothing surfaces
*peer-reviewed acceptance at top venues*. Readers asked to pull from NeurIPS, ICLR, and
ICML. Google Scholar is already wired but gated behind a paid SerpAPI key and largely
redundant with the free Semantic Scholar citations, so it is not the right vehicle.

### Decision
Add a free, key-less conference source backed by **Semantic Scholar's venue filter**,
and thread a `venue` field through the pipeline so conference papers carry a visible
badge. Because most conference papers also have an arXiv preprint, dedup merges them
into existing arXiv rows — so papers already in the corpus light up with an acceptance
badge (e.g. "NeurIPS 2024").

### New source adapter
`lib/sources/conferences.ts` → `fetchConferences()`:

- Target venues (short label ↔ Semantic Scholar canonical name):
  - `NeurIPS` ↔ "Neural Information Processing Systems"
  - `ICML` ↔ "International Conference on Machine Learning"
  - `ICLR` ↔ "International Conference on Learning Representations"
- For each venue, call the existing S2 search endpoint
  (`https://api.semanticscholar.org/graph/v1/paper/search`) with the `venue` filter and
  a recent `year` range (default: current year and the prior year — bounded to keep
  volume sane), reusing the same headers/`x-api-key`-if-present and **429-tolerant skip**
  as `fetchS2Famous`. No API key required.
- Fields requested add `venue` (and `publicationVenue`) to the existing field set.
- Each parsed paper is stamped `venue: "<shortLabel> <year>"` (e.g. `"NeurIPS 2024"`)
  using the short label of the venue that produced it plus the paper's `year`. Stamping
  from the query (not from S2's raw venue string) avoids fragile venue-name
  normalization. If `year` is missing, use just the short label.
- Registered in `lib/sources/index.ts` as
  `{ id: "conferences", enabled: true, run: () => fetchConferences() }`, with
  `"conferences"` added to the `SourceId` union in `lib/types.ts`.

> Note: exact S2 venue-string matching can be finicky. The adapter test uses a recorded
> fixture to lock parsing; the live `venue`/`year` query params will be tuned against the
> real API during implementation. A venue that returns nothing is non-fatal (empty array,
> same as a 429 skip).

### `venue` field threaded through the pipeline
- `lib/types.ts`: add `venue: string | null` to `NormalizedPaper` and
  `venue: string | null` to `PaperRow`.
- `lib/sources/semanticscholar.ts` (`parseS2`): capture `venue` from the S2 response
  when present (used by `fetchConferences`; the existing `fetchS2Famous` may also gain a
  venue when S2 returns one — harmless). `S2Paper` gains `venue?` / `publicationVenue?`.
- `lib/corpus/dedupe.ts`: when merging, `venue: cur.venue ?? p.venue` so a non-null
  conference venue is preserved onto a merged arXiv row regardless of source order.
- `lib/corpus/upsert.ts` (`toPaperRow`): map `venue: p.venue ?? null`.
- Migration `supabase/migrations/0005_papers_venue.sql`:
  `alter table papers add column venue text;` — additive, nullable, safe; existing rows
  stay `NULL`.

### UI: venue badge on the card
- `components/PaperCard.tsx`: when `paper.venue` is set, render a small badge chip in
  the top meta row (the line with category · date · signal), styled to read as an
  acceptance tag (distinct from the accent category text — e.g. a faint bordered/tinted
  chip). Absent `venue` → no chip, layout unchanged.
- Conference papers also surface in **Famous** (ordered by `citations`) and **Latest**
  (ordered by `published_at`) with no feed changes — they flow through the existing
  ranking. No new tab or filter (explicitly out of scope; the badge is the surface).

### Testing
- `fetchConferences` / `parseS2`: a recorded S2 fixture → papers parse with
  `venue: "NeurIPS 2024"`-style labels, arXiv IDs, citations.
- `dedupe`: an arXiv-only paper merged with a conference paper of the same arXiv ID
  yields one row carrying the conference `venue`.
- `toPaperRow`: maps `venue` (including `null`).
- `PaperCard`: renders the badge when `venue` is set; renders nothing extra when it is
  `null`.

### Operational note
Reader HTML is cached in `paper_content` with no invalidation, but this change does not
touch sanitize/fetch, so no cache bust is required. The new `venue` column is read
straight from `papers`, which the cron refresh upserts.

---

## Out of scope
- A dedicated "Conferences" feed/tab or venue filter (badge only this round).
- Enabling Google Scholar / SerpAPI.
- Backfilling `venue` for historical rows — they fill in as the cron re-ingests.
- PDF reader behavior (the reversible-rail change is HTML-reader only, as in the
  original read-rail spec).
- Linking the Latest/Famous hints to their sources (only the upvotes hint was requested).
