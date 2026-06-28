# "Finish here" button → exact read highlight (HTML reader, v2)

**Date:** 2026-06-28
**Status:** Approved (design), pending spec review
**Scope:** HTML reader only. PDF reader unchanged (it keeps its own `ReaderBar` +
page tint).

## Background

This supersedes the automatic read-depth indicators on the HTML reader:

- The **scroll-depth rail** (thin amber line in the left gutter, `read_pct`).
- The **progressive `read_max_pct` wash** added earlier on this branch.

The wash rendered with `absolute inset-x-0` on the full-width `.relative` wrapper,
but the paper text is a centered `max-width: 52rem` column (`.paper-html { margin:
0 auto }`). On a wide screen the band painted the empty side margins, not the text —
it looked like a highlight "on the side, not on the paper."

The original "first version" had a floating **"I finished here"** button that tinted
read blocks; it was replaced by the rail. We are bringing the button back, but with
an **exact pixel cutoff** and **correctly constrained to the text column**.

## Decision

Replace the rail + wash with a **button-driven read highlight**:

- A floating **"I finished here"** pill (the existing shared `ReaderBar`) stays
  pinned bottom-center while reading.
- Tapping it marks everything from the top of the paper down to the **bottom of the
  current viewport** ("everything on screen") as read, cut **exactly** at that line.
- The highlight is a pale-yellow band painted **behind the 52rem text column**
  (matching `.paper-html`), so it sits on the paper, not the side margins.
- It is **sticky**: it does not move as you scroll and survives reloads; it only
  changes when you tap again (to a new position) or **"Clear mark"**.
- Marking at the very bottom sets `status = 'done'` (drops the paper off the
  "Continue reading" shelf); clearing returns it to `reading`.

The newer manual-highlight feature (`HighlightLayer`, `mark.pd-highlight`) is
**kept** and is independent of this band.

## Model

One persisted quantity: **marked read boundary** (`markedPct`), a fraction `0–1` of
the reader content height. `0` means **unmarked** (no band). Set only by the button;
never by scrolling.

- Capture at tap time from the content element's live rect: `markedPct =
  clamp01((innerHeight − contentRectTop) / contentHeight)`, where `contentRectTop =
  content.getBoundingClientRect().top` (viewport-relative) and `contentHeight =
  content.offsetHeight`. (Using the viewport-relative rect avoids `offsetTop`, which is
  measured against the positioned `.relative` wrapper, not the document.)
- Render: a band of `height: markedPct × 100%` of the content, so within a session it
  is pixel-exact; on reload `cutoffY = markedPct × contentHeight` reproduces it
  (stable for the same layout). Late reflow (images/MathJax loading after a mark) can
  shift the mapping slightly — acceptable, and the same class of issue the resume
  logic already tolerates.
- `markedPct ≥ DONE_THRESHOLD` (0.98, reuse `lib/reader/readDepth`) ⇒ `status = 'done'`.

This is distinct from the existing resume data (`scroll_pct` + `block_anchor`, still
written on scroll for resume) and from `read_pct` (see Data model).

## Pure helper (testable, DOM-independent)

Add to `lib/reader/readDepth.ts`:

```ts
/** Fraction (0–1) of the content the reader has marked as read — the viewport
 *  bottom relative to the content box. `contentRectTop` is the content element's
 *  viewport-relative top (getBoundingClientRect().top), so scrollY cancels out. */
export function readBoundaryFraction(
  viewportHeight: number, // window.innerHeight
  contentRectTop: number, // content.getBoundingClientRect().top
  contentHeight: number,  // content.offsetHeight
): number {
  if (contentHeight <= 0) return 0;
  return Math.min(1, Math.max(0, (viewportHeight - contentRectTop) / contentHeight));
}
```

`isComplete` / `DONE_THRESHOLD` stay as-is. The old `readDepthFraction` (rail) is
removed along with the rail.

## Data model

Migration `supabase/migrations/0008_progress_marked_pct.sql` — **rename** the column
this branch added (`read_max_pct`, only present on this branch, so a rename is clean
and loses no real data), idempotently:

```sql
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'reading_progress' and column_name = 'read_max_pct')
     and not exists (select 1 from information_schema.columns
                     where table_name = 'reading_progress' and column_name = 'marked_pct')
  then
    alter table reading_progress rename column read_max_pct to marked_pct;
  end if;
end $$;
```

`marked_pct` keeps `read_max_pct`'s `real not null default 0` definition, so `0` =
unmarked.

- `ProgressRow` (`lib/types.ts`): `readMaxPct` → **`markedPct: number`**.
- `ProgressUpdate` + `buildProgressRow` (`lib/db/progressRow.ts`): `readMaxPct` →
  **`markedPct`** ↔ `marked_pct`, written **only when provided** (so a scroll-only
  save never clobbers the mark; clearing passes `markedPct: 0`).
- `loadProgress` (`app/actions/progress.ts`): map `markedPct: data.marked_pct ?? 0`.

### Not touched

- `read_pct` stays a column and the HTML reader **keeps writing it** (current scroll
  depth, debounced) so the shelf/card "% read" (`max(read_pct, scroll_pct)` in
  `lib/db/queries.ts`) is unchanged.
- `status` is still reversible and still set explicitly (now by `onMark`/`onClear`).
- PDF reader, `marked_anchor`.

## Reader rendering (`components/HtmlReader.tsx`)

Remove: the `read-rail` element, the `read-tint` progressive wash, and the
`readMaxPct` scroll-tracking state/ref. Keep: `containerRef`, `orderedAnchors`,
`topBlock`, resume effect, debounced scroll persistence (for `scroll_pct` /
`block_anchor` / `read_pct`), and `HighlightLayer`.

Add:

- State `markedPct` seeded from `initialProgress?.markedPct ?? 0`.
- `onMark()`: read live geometry from the content element, compute `frac =
  readBoundaryFraction(window.innerHeight, content.getBoundingClientRect().top,
  content.offsetHeight)`, `setMarkedPct(frac)`, `persist({ markedPct: frac, status:
  isComplete(frac) ? "done" : "reading" })`.
- `onClear()`: `setMarkedPct(0)`, `persist({ markedPct: 0, status: "reading" })`.
- The debounced **scroll** save must keep omitting `status` and `markedPct` (it
  writes only `scroll_pct` / `block_anchor` / `read_pct` / `reader_kind`), so
  scrolling never clobbers the mark or its `done`/`reading` state — only the buttons
  change those.
- Render the band as the first child of the `.relative` wrapper:

```tsx
{markedPct > 0 && (
  <div
    data-testid="read-mark"
    aria-hidden
    className="pointer-events-none absolute left-1/2 top-0 z-0 w-full max-w-[52rem] -translate-x-1/2 bg-[var(--read-tint)] transition-[height] duration-150 ease-linear"
    style={{ height: `${markedPct * 100}%` }}
  />
)}
```

- Content div keeps `relative z-10` so text + `mark.pd-highlight` paint above the band.
- Replace `ReaderProgressBar` with the shared **`ReaderBar`** (top accent bar +
  floating pill): `marked={markedPct > 0}`, `onMark`, `onClear`,
  `progressPct={currentScrollPct()}` (live), and the "Marked ✓" `hint` flash on mark.

The band is centered with `left-1/2 -translate-x-1/2 w-full max-w-[52rem]` to match
`.paper-html`'s box, so it lands on the text column, not the side margins.

## Testing

- `readBoundaryFraction` (pure): basic fraction, clamps to `[0,1]`, `0` when
  `contentHeight ≤ 0`; combined with `isComplete` for the `≥ 0.98 ⇒ done` boundary.
- `buildProgressRow`: writes `marked_pct` when `markedPct` provided (including `0`);
  omits it otherwise.
- `HtmlReader` (jsdom):
  - No `read-rail` / `read-tint` elements remain.
  - With saved `markedPct: 0.4` → a `read-mark` band renders at `height: 40%`;
    with `markedPct: 0` → no band.
  - Clicking "I finished here" (with stubbed geometry) renders the band at the
    computed fraction and persists `marked_pct` + a `status`; geometry near the
    bottom persists `status: "done"`.
  - "Clear mark" removes the band and persists `marked_pct: 0`, `status: "reading"`.
  - The band stays put on subsequent scroll (sticky — only the button changes it).

## Out of scope

- PDF reader behavior.
- Shelf / card "% read" (still `max(read_pct, scroll_pct)`).
- Per-word DOM highlighting (the considered "approach B").
- Backfilling `marked_pct` for historical rows (default `0` = unmarked).
