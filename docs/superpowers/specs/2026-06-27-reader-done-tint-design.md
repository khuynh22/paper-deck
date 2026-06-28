# "Read" tint on the HTML reader (revealed when done)

**Date:** 2026-06-27
**Status:** Approved (design), pending spec review
**Scope:** HTML reader only. The PDF reader is explicitly out of scope (it already
tints read pages yellow).

## Problem / motivation

The HTML reader originally tinted read **blocks** with a pale-yellow background
(`.read { background: var(--read-tint) }`). Because arXiv blocks are chunky (tall
figures, tables, equations) the tint spilled past where the reader actually
stopped, so it was replaced by the thin amber scroll-depth **rail** in the left
gutter (`2026-06-12-scroll-depth-read-rail-design.md`) and the block tint was
removed.

The reader still wants a **yellow "I read this" mark** on finished papers — the
look the old tint gave — but without the spill problem. The fix: drive the tint
from **read depth** (a continuous pixel boundary), not from blocks, and only show
it **once the paper is finished**.

## Decision

Add a soft yellow **read tint** to the HTML reader that:

1. **Tints the read portion** — a full-width pale-yellow wash behind the text,
   from the top of the content down to a read-depth boundary. Because the boundary
   is a pixel fraction (not a block), there is no spill.
2. **Is revealed only when done** — hidden entirely until the paper has been read
   to completion (read depth reached the `DONE_THRESHOLD` of 0.98), then shown.
3. **Is sticky once earned** — its extent is the **deepest** read depth ever
   reached, a monotonic value that does not retreat when the reader scrolls back
   up to re-read, and persists across reloads.

This is **distinct from and independent of** the existing reversible `status`. The
`2026-06-14` spec deliberately makes `status` reversible (`done → reading` when you
scroll back up) so a re-read paper reappears on the "Continue reading" shelf. The
tint must **not** change that, so it cannot be derived from `status` or from the
reversible `read_pct`. It needs its own persisted quantity.

## Model

One new per-paper quantity: **deepest read depth** (`readMaxPct`), a fraction
`0–1` of the document height — the monotonic max of the read-depth fraction over
all sessions.

| Field | Meaning | Reversible? | Drives |
|-------|---------|-------------|--------|
| `scroll_pct` + `block_anchor` | last position when you left | n/a | resume |
| `read_pct` (existing, 0004) | **current** viewport-bottom fraction | yes (rises/falls) | left rail, top progress bar, shelf "% read", `status` |
| `read_max_pct` (**new**) | **deepest** read-depth fraction ever reached | no (monotonic max) | the read tint (reveal + extent) |

Derived rule: the tint is shown iff `read_max_pct ≥ DONE_THRESHOLD` (0.98); its
height is `read_max_pct` of the content height. In practice, finishing a paper
drives `read_max_pct` to ≈1.0, so the wash covers essentially the whole document;
the boundary only leaves an untinted tail (≤ ~2%) when the reader stopped exactly
at the done threshold.

## Data model

Migration `supabase/migrations/0007_progress_read_max_pct.sql`:

```sql
alter table reading_progress add column if not exists read_max_pct real not null default 0;
```

- Additive, nullable-safe, `if not exists` (re-apply safe; the Supabase ledger
  uses timestamp versions, not the repo's `000N` prefixes). Existing rows default
  to `0`, so previously-finished papers show **no** tint until re-read to the end.
- `ProgressRow` (`lib/types.ts`) gains `readMaxPct: number`.
- `ProgressUpdate` + `buildProgressRow` (`lib/db/progressRow.ts`) gain
  `readMaxPct` ↔ `read_max_pct`, written **only when provided** (so a save that
  omits it never clobbers the stored max).
- `loadProgress` (`app/actions/progress.ts`) maps `data.read_max_pct ?? 0`.

### Not touched

- `getProgressMap` / `getContinueReading` (`lib/db/queries.ts`) keep selecting
  `read_pct` / `scroll_pct` / `status`. `read_max_pct` is read **only** by the HTML
  reader. The shelf and card "% read" are unchanged.
- `status` semantics — still reversible, still derived from the current `read_pct`.
- The PDF reader and `marked_anchor`.

## Reader rendering (`components/HtmlReader.tsx`)

State:

- Existing reversible `readPct` (current viewport bottom) — unchanged; drives the
  rail and the top progress bar.
- New `readMaxPct`, seeded from `initialProgress?.readMaxPct ?? 0` on mount.

Scroll handler (existing `onScroll`):

- Keep the unconditional `setReadPct(frac)` (reversible rail).
- Add `readMaxPct = max(readMaxPct, frac)` (monotonic), via a ref + state so the
  tint re-renders when it grows.

`persist()`:

- Sends `readPct: readPctRef.current` and **`readMaxPct: readMaxPctRef.current`**,
  plus the existing `status: isComplete(readPct) ? "done" : "reading"` (still from
  the *current* depth, so the shelf reversibility is preserved).

Markup — a new tint layer inside the existing `.relative` wrapper, a sibling of the
rail and the content:

```tsx
{isComplete(readMaxPct) && (
  <div
    data-testid="read-tint"
    aria-hidden
    className="pointer-events-none absolute inset-x-0 top-0 z-0 bg-[var(--read-tint)] transition-opacity duration-300"
    style={{ height: `${clamp01(readMaxPct) * 100}%` }}
  />
)}
```

Z-order (so the wash sits behind text and behind user highlights):

- Tint layer: `absolute inset-x-0 top-0 z-0`.
- Content div (`paper-html`, `dangerouslySetInnerHTML`): gains `relative z-10`, so
  the text and the injected `mark.pd-highlight` elements paint **on top** of the
  wash.
- Read rail: keep it on top with `z-20` so the amber bar stays crisp over the wash.
- The amber rail and the tint **coexist**: rail = "where I am now" (reversible),
  tint = "I finished this" (sticky).

Color: existing `--read-tint` (`#f8f0dc` light / `#2b2414` dark) — the same value
the PDF reader uses for read pages. No new CSS variable.

## Testing

- `buildProgressRow` (`tests/db/...`): writes `read_max_pct` when `readMaxPct` is
  provided; omits the key when it is not.
- `HtmlReader` (jsdom, `tests/components/HtmlReader.test.tsx`):
  - **Hidden below threshold:** seeded with `readMaxPct < 0.98` → no
    `[data-testid="read-tint"]` element.
  - **Shown when earned:** seeded with `readMaxPct ≥ 0.98` → tint present with
    `style.height` equal to that percentage.
  - **Sticky:** scroll to the bottom (≥ 0.98) → tint appears; then scroll back up
    → tint **stays** at full height while the rail shrinks and the persisted
    `status` flips to `"reading"`.
  - **Persist:** a `persist()` after scrolling sends `read_max_pct` as the running
    max (never lower than a previously reached value).

## Operational notes

- Reader HTML is cached in `paper_content`, but this change does not touch
  sanitize/fetch, so **no cache bust** is required.
- Apply the migration via the Supabase MCP (`apply_migration`) against project
  `rrbmucsbqsoyspsoftvl`, or let the file ship for the next migration run; it is
  `if not exists`, so re-application is safe.

## Out of scope

- PDF reader behavior (keeps its existing page tint).
- Changing the shelf / card "% read" (still `max(read_pct, scroll_pct)`).
- Backfilling `read_max_pct` for historical rows — they stay `0` and fill in as
  papers are re-read to the end.
- Hiding the amber rail once a paper is done (rail and tint intentionally coexist).
