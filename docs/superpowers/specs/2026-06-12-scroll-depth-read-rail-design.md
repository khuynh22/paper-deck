# Scroll-depth read rail (HTML reader)

**Date:** 2026-06-12
**Status:** Approved (design), pending spec review
**Scope:** HTML reader only. The PDF reader is explicitly out of scope this round.

## Problem

Reading progress in the HTML reader is marked **per block**. "I finished here"
snaps the read boundary to the last `[data-blk]` whose top is above the fold,
and the `.read` highlight tints whole blocks. Because arXiv content includes
tall blocks (figures, tables, multi-line equations) and nested section
containers, the amber highlight spills well past where the reader actually
stopped — e.g. finishing subsection 2.1 tints to the bottom of a figure or to
the end of the whole section. Scroll position is continuous; blocks are chunky.
The mismatch is the root cause.

Prior fixes (leaf-only anchors, inclusive marking, conditional `status`) reduced
but did not remove the spill, because a single tall leaf block still tints to its
own bottom.

## Decision

Replace block-based marking with an **automatic, scroll-position read rail**:

- **Automatic** — no "I finished here" / "Clear mark" buttons. Read depth is a
  side effect of scrolling.
- **Scroll position, not blocks** — the read boundary is a pixel position derived
  from scroll, never snapped to a block.
- **Left-margin rail** — a thin amber bar in the left gutter, filled from the top
  of the content down to the read boundary. No tint over text/figures/equations.

### Accepted trade-off

> **Superseded 2026-06-14:** the read rail is now fully reversible — scrolling up
> lowers the rail and can return a finished paper to `reading`. See
> `2026-06-14-reader-and-sources-improvements-design.md` §2. The monotonic
> "no un-mark" behavior described below no longer applies.

Deepest-scroll tracking is monotonic and has **no un-mark**: scrolling (or
flinging) to the bottom fills the rail to 100% permanently. This is inherent to
the automatic model and was accepted during design.

## Model

One new per-paper quantity: **read depth** (`readPct`), a fraction `0–1` of the
document height.

- Definition: `readPct = max over the session of (scrollY + innerHeight) /
  documentHeight`, i.e. the deepest point that has reached the **bottom** of the
  viewport. Monotonic — only increases.

> **Superseded 2026-06-14:** `readPct` is now the *current* viewport-bottom fraction (it rises and falls with scrolling), not a session max. See `2026-06-14-reader-and-sources-improvements-design.md` §2.
- The client owns the max: it seeds from the saved `readPct` on mount and bumps
  it on scroll. The server stores whatever the client sends (no server-side max).
- `readPct ≥ 0.98` ⇒ `status = 'done'` (bottom of the last screen reached), which
  drops the paper off the "Continue reading" shelf.

This is **distinct** from the existing resume data:

| Field | Meaning | Used for |
|-------|---------|----------|
| `scroll_pct` + `block_anchor` | last position when you left | resume (scroll you back) — unchanged |
| `read_pct` (new) | deepest fraction reached | the rail, "% read" on cards/shelf, done detection |

## Data model

Migration `0004`: `alter table reading_progress add column read_pct real not null default 0;`

- Additive and safe; existing rows default to `0`.
- `ProgressRow` / `ProgressUpdate` / `buildProgressRow` gain `readPct` ↔ `read_pct`.
- `marked_anchor` is no longer written by the HTML reader. The column stays (the
  PDF reader still uses it for its deepest page); only HTML stops touching it.

### Shelf / card "% read"

`getProgressMap` and `getContinueReading` currently show `scroll_pct`. They will
select both `scroll_pct` and `read_pct` and display `max(read_pct, scroll_pct)`:

- HTML rows: `read_pct ≥ scroll_pct`, so the shelf shows true deepest-read.
- PDF rows: `read_pct = 0`, so `max` falls back to `scroll_pct` — **PDF display is
  unchanged**.

## Chrome changes

- `ReaderBar` is shared with the PDF reader and stays intact for it. Extract the
  top accent progress bar into a small shared `ReaderProgressBar` component.
- **HTML reader** renders only `ReaderProgressBar` (driven by `readPct`, so it is
  monotonic and matches the rail) plus the new rail. No pill, no buttons.
- **PDF reader** continues to use the full `ReaderBar` unchanged.

## What gets removed (HTML path only)

- `blocksUpTo` and `isLastBlock` in `lib/reader/anchor.ts` (and their tests) —
  dead once block highlighting is gone. `resolveResumeTarget` stays (resume still
  uses block anchors).
- The leaf-block helpers, `.read` toggling, and `onMark`/`onClear` handlers in
  `HtmlReader`.
- The `.read` CSS rule (verify the PDF reader does not rely on it — PDF tints via
  inline classes, so it does not).

## Testing

- `buildProgressRow`: writes `read_pct` only when provided; still omits `status`
  on scroll-only saves.
- Read-depth math (pure helper, e.g. `readDepthPct(scrollY, innerHeight, docHeight)`
  clamped to `0–1`) — unit tested, including the `≥ 0.98 ⇒ done` threshold.
- `HtmlReader` (jsdom): seeds the rail from saved `readPct`; the rail never
  exceeds 100%; no "I finished here" button is rendered.
- Shelf/card "% read" = `max(read_pct, scroll_pct)`.

## Out of scope

- PDF reader behavior and chrome (keeps its button + page tinting).
- Retroactively recomputing `read_pct` for existing rows (they start at `0` and
  fill in as the user re-reads).
