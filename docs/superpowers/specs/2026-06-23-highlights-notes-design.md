# Highlights & Notes — Design (v1)

**Status:** approved for planning
**Branch:** `feat/reader-highlights-notes` (off `master`)
**Date:** 2026-06-23

## Summary

Let signed-in users highlight a passage of text in the **HTML reader** and attach an
optional note to it. Highlights render inline on re-open and are clickable to
view/edit/delete the note. This reuses the reader's existing `data-blk` block
anchors (already used for scroll-resume and the read-rail) as the anchoring base.

## Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Granularity | **Text selection** (phrase/sentence), stored as block anchor + char offsets | What researchers expect; precise. |
| Reader scope | **HTML reader only** | Primary reader; PDF text-layer highlighting is a separate, harder problem. |
| Notes | **Optional note attached to a highlight** (one concept) | Simplest model that covers "highlight + comment". |
| Cross-block selections | **Clamp to the starting block** | Keeps the data model `{block, start, end}` simple/robust. |
| Surfacing | **In-reader only** | Self-contained v1; no new routes. |
| Color | **Single color** | YAGNI on multi-color. |
| Overlaps | **Disallowed at creation** | Keeps rendering simple (no nested-mark splitting). |
| Rendering | **Client-side `<mark>` decoration** (Approach A) | Per-user data stays out of the shared `paper_content` cache; a real element makes click-to-edit-note natural; pure offset math is unit-testable. |

### Approaches considered

- **A — Text-offset anchoring + client-side `<mark>` decoration (CHOSEN).** Store
  `{block_anchor, start_offset, end_offset, quote, note}`; offsets index the block's
  normalized `textContent`. After mount, a client effect wraps `[start,end]` in a
  `<mark>`, splitting text nodes as needed. Clicking a `<mark>` opens the note popover.
  - *Cons:* anchors drift if a paper's sanitized HTML is regenerated — mitigated by
    storing `quote` and skip-painting on mismatch.
- **B — CSS Custom Highlight API (`::highlight()`), no DOM mutation.** Same anchoring
  but paints ranges via the Highlight registry. Rejected: click-to-edit-note needs
  manual `caretRangeFromPoint` hit-testing; newer browser support; awkward in jsdom.
- **C — Server-side `<mark>` injection per request.** Rejected: can't serve the shared
  cached HTML as-is (per-user post-processing), every create/delete forces a
  re-render, and offset math on a raw tag-laden string is far hairier than over DOM
  text nodes.

## Architecture

### Data model — `supabase/migrations/0006_highlights.sql`

```sql
create table if not exists highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  paper_id uuid not null references papers(id) on delete cascade,
  block_anchor text not null,      -- the data-blk value, e.g. "12"
  start_offset int not null,       -- char index into the block's textContent
  end_offset int not null,         -- exclusive
  quote text not null,             -- selected text: drift detection + popover display
  note text,                       -- optional comment (nullable)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_offset >= 0 and end_offset > start_offset)
);
create index if not exists highlights_user_paper_idx on highlights (user_id, paper_id, created_at);

alter table highlights enable row level security;
drop policy if exists "highlights owner" on highlights;
create policy "highlights owner" on highlights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Apply via Supabase MCP (timestamp version in the ledger) **and** commit as the
`0006_highlights.sql` repo file. `if not exists` / `drop policy if exists` keep
re-apply idempotent, consistent with the existing ledger-vs-file-numbers split.

### Anchor core — `lib/reader/highlightRange.ts`

Offsets are character indices into a block's normalized `textContent` (the in-order
concatenation of its descendant text nodes). Creation and rendering both use the same
text-node walk, so they stay consistent across inline markup (`<em>`, `<a>`, `<code>`).

**Pure (no DOM — unit tested):**
- `absoluteOffset(nodeLengths: number[], nodeIndex: number, offsetInNode: number): number`
- `rangesToWrap(nodeLengths: number[], start: number, end: number): { nodeIndex: number; from: number; to: number }[]`
  — the text-node sub-spans that the `[start,end]` range covers.

**Thin DOM adapters (jsdom tested):**
- `textNodesOf(block: Element): Text[]` — ordered descendant text nodes (TreeWalker).
- `offsetsFromSelection(block: Element, range: Range): { start: number; end: number } | null`
  — computes offsets via `absoluteOffset`; clamps the end to the block's length;
  returns `null` if the selection is collapsed/whitespace-only or starts/ends inside a
  `<math>` subtree.
- `decorateBlock(block: Element, highlights: Highlight[], onClick): void` — applies
  `rangesToWrap` and wraps each sub-span in
  `<mark class="pd-highlight" data-hl-id="…">`. **Validates `quote` against the live
  text slice and skips painting on mismatch** (drift-safe). Skips any sub-span whose
  text node is inside a `<math>` ancestor so equation layout isn't broken.

### Server actions — `app/actions/highlights.ts` + `lib/db/highlightRow.ts`

Same shape as `app/actions/progress.ts`: `"use server"` → `currentUser()` guard →
`serverClient()`; RLS double-enforces ownership. Inputs validated with `zod`
(non-negative int offsets, `end > start`, quote/note length caps).

- `loadHighlights(paperId: string): Promise<Highlight[]>` — current user's highlights
  for the paper (empty array when logged out).
- `createHighlight(input): Promise<Highlight | null>` — insert; returns the row
  (with `id`) so the client can paint optimistically.
- `updateHighlightNote(id: string, note: string | null): Promise<void>`
- `deleteHighlight(id: string): Promise<void>`

`lib/db/highlightRow.ts` holds the row⇄`Highlight` mappers + the zod schema (mirrors
`lib/db/progressRow.ts`). New `Highlight` type added to `lib/types.ts`:

```ts
export interface Highlight {
  id: string;
  paperId: string;
  blockAnchor: string;
  startOffset: number;
  endOffset: number;
  quote: string;
  note: string | null;
}
```

### Reader integration — `components/HighlightLayer.tsx`

`HtmlReader` already owns `containerRef`. A new `HighlightLayer` child keeps
`HtmlReader` lean and owns the highlight UX:

- On a non-collapsed selection inside a `[data-blk]`, show a floating **"Highlight"
  button** near the selection. Suppressed when the selection intersects an existing
  `<mark>` (overlaps disallowed in v1).
- On click → `offsetsFromSelection` → `createHighlight` → optimistic paint → clear
  selection.
- Decorate all blocks on mount and whenever the highlight set changes.
- On clicking an existing `<mark>` → **note popover** anchored to it: a textarea with
  Save and Delete.

The reader route (`app/reader/[id]/page.tsx`) already redirects unauthenticated users
to `/login`, so the viewer is always signed in — there is no anonymous reader path to
handle. `loadHighlights` still guards on `currentUser()` (returns `[]` when logged out)
as defensive practice, mirroring `loadProgress`.

`app/reader/[id]/page.tsx` (via `components/ReaderView.tsx`) loads `initialHighlights`
server-side — exactly like `initialProgress` — and passes them to `HtmlReader`, which
forwards them to `HighlightLayer`.

### Styling — `app/globals.css`

`.pd-highlight`: translucent amber via a new `--highlight-bg` token (dark-mode aware),
inheriting text color; a `has-note` variant gets a subtle underline/dot indicator.
Single color in v1.

## Error & edge-case handling

- **Drift** (sanitized HTML regenerated): `quote` no longer matches the live slice →
  `decorateBlock` skips that highlight. Data is preserved; it simply doesn't render.
  (Quote-based re-anchoring recovery is out of scope.)
- **Selection spanning blocks:** clamp to the starting block (`offsetsFromSelection`
  uses the start container's `[data-blk]` and clamps `end` to that block's length).
- **Overlaps:** prevented at creation (toolbar suppressed when the selection intersects
  an existing mark).
- **Collapsed / whitespace-only / inside-`<math>` selections:** ignored.
- **Length caps:** note (e.g. 2000 chars) and quote enforced via zod and at the DB
  layer where practical.

## Testing strategy (TDD)

- **Pure functions (no DOM):** `absoluteOffset`, `rangesToWrap` — single-node,
  multi-node, boundary, and out-of-range cases.
- **jsdom:** `offsetsFromSelection` (across inline `<em>`, cross-block clamp, `null` on
  collapsed/in-`<math>`), `decorateBlock` (wrap correctness, quote-mismatch skip,
  math skip, idempotent re-decorate).
- **Server actions:** auth guard + zod validation, with Supabase mocked to match the
  existing test patterns in the repo.
- **Component:** `HighlightLayer` — selection → toolbar → create; click mark → popover
  → save/delete — via `@testing-library/react`.

## File map

| File | Change |
|---|---|
| `supabase/migrations/0006_highlights.sql` | new — table + RLS |
| `lib/types.ts` | + `Highlight` type |
| `lib/reader/highlightRange.ts` | new — pure offset math + DOM adapters |
| `lib/db/highlightRow.ts` | new — row⇄`Highlight` mappers + zod |
| `app/actions/highlights.ts` | new — load/create/updateNote/delete server actions |
| `components/HighlightLayer.tsx` | new — selection toolbar, decoration, note popover |
| `components/HtmlReader.tsx` | wire in `HighlightLayer` (reuses existing `containerRef`) |
| `app/reader/[id]/page.tsx`, `components/ReaderView.tsx` | load + pass `initialHighlights` |
| `app/globals.css` | `.pd-highlight` styles + `--highlight-bg` token |
| tests alongside the above | per the testing strategy |

## Out of scope (future branches)

PDF reader highlights; cross-block ranges; multi-color; global "My Notes" page; count
badges on paper cards; export (BibTeX/markdown); recovery/re-anchoring of drifted
highlights.
