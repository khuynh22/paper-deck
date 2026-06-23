# Highlights & Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-in users select text in the HTML reader, highlight it, and attach an optional note — rendered inline on re-open and editable by clicking the highlight.

**Architecture:** Highlights anchor to the reader's existing `data-blk` block indices plus character offsets into that block's normalized `textContent`. They are stored per-user (RLS) and painted client-side as `<mark>` elements after the cached HTML mounts, so per-user data never enters the shared `paper_content` cache. Pure offset math is isolated for unit testing; a `HighlightLayer` component owns the selection toolbar, decoration, and note popover.

**Tech Stack:** Next 16 (App Router, Server Actions), React 19, Supabase (Postgres + RLS), Zod 4, Vitest + jsdom + @testing-library/react, Tailwind v4.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-23-highlights-notes-design.md` (authoritative).
- **Scope:** HTML reader only; text-selection granularity; single-block (clamp); optional note per highlight; in-reader surfacing only; single highlight color; overlaps disallowed at creation.
- **Tests live in the parallel `tests/` tree**, mirroring source paths (e.g. `lib/x.ts` → `tests/x.test.ts`). Never co-locate tests with source. Test runner: `pnpm test` (Vitest, jsdom, `@` aliased to repo root).
- **Server actions** follow the `app/actions/progress.ts` shape: `"use server"`, `currentUser()` guard, `serverClient()`, RLS enforces ownership; defense-in-depth `.eq("user_id", user.id)` on every per-user query.
- **Supabase project id:** `rrbmucsbqsoyspsoftvl`. Migration files are `if not exists` / `drop policy if exists` (idempotent); the repo uses `000N_` prefixes while the MCP ledger uses timestamp versions (both fine).
- **Dev server:** `pnpm dev` runs webpack (`next dev --webpack`) — do NOT use Turbopack.
- **Every commit message** ends with the two standard trailers (shown once here; later steps abbreviate as "(+ trailers)"):
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01UmWCgJgpZye1LWFftWeT5G
  ```
- Run `pnpm typecheck` and `pnpm test` before the final commit of each task.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0006_highlights.sql` | `highlights` table + index + RLS (new) |
| `lib/types.ts` | `Highlight` app type (modify: append) |
| `lib/db/highlightRow.ts` | row⇄`Highlight` mappers, insert builder, Zod input schema, length caps (new) |
| `lib/reader/highlightRange.ts` | pure offset math + DOM adapters (selection→offsets, decorate, clear) (new) |
| `app/actions/highlights.ts` | `loadHighlights` / `createHighlight` / `updateHighlightNote` / `deleteHighlight` server actions (new) |
| `components/HighlightLayer.tsx` | selection toolbar, decoration orchestration, note popover (new) |
| `components/HtmlReader.tsx` | mount `HighlightLayer`, pass `containerRef` + `initialHighlights` (modify) |
| `components/ReaderView.tsx` | thread `initialHighlights` to `HtmlReader` (modify) |
| `app/reader/[id]/page.tsx` | load `initialHighlights` server-side (modify) |
| `app/globals.css` | `.pd-highlight` styles + `--highlight-bg` token (modify) |
| `tests/db/highlightRow.test.ts`, `tests/reader/highlightRange.test.ts`, `tests/actions/highlights.test.ts`, `tests/components/HighlightLayer.test.tsx` | tests (new) |
| `tests/components/HtmlReader.test.tsx` | add highlights-action mock + integration assertion (modify) |

---

## Task 1: Database migration + `Highlight` type

**Files:**
- Create: `supabase/migrations/0006_highlights.sql`
- Modify: `lib/types.ts` (append the `Highlight` interface)

**Interfaces:**
- Produces: SQL table `highlights(id, user_id, paper_id, block_anchor, start_offset, end_offset, quote, note, created_at, updated_at)`; TS `Highlight { id, paperId, blockAnchor, startOffset, endOffset, quote, note }`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0006_highlights.sql`:

```sql
-- Per-user text highlights + optional notes for the HTML reader.
-- Anchored to a block's data-blk index plus char offsets into its textContent.
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
create index if not exists highlights_user_paper_idx
  on highlights (user_id, paper_id, created_at);

alter table highlights enable row level security;

drop policy if exists "highlights owner" on highlights;
create policy "highlights owner" on highlights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Apply the migration to the Supabase project**

Use the Supabase MCP `apply_migration` tool (project id `rrbmucsbqsoyspsoftvl`, name `highlights`) with the SQL body above. (Local dev picks the file up on the next `npx supabase db reset` / `start`.)

- [ ] **Step 3: Verify the table exists**

Use the Supabase MCP `list_tables` tool and confirm a `highlights` table with the columns above and RLS enabled.
Expected: table present, `rls_enabled: true`, policy `highlights owner`.

- [ ] **Step 4: Append the `Highlight` type**

In `lib/types.ts`, after the `ProgressRow` interface, append:

```ts
/** A user's text highlight (+ optional note) within a paper's HTML reader. */
export interface Highlight {
  id: string;
  paperId: string;
  blockAnchor: string;
  /** Char offset into the block's textContent (inclusive). */
  startOffset: number;
  /** Char offset into the block's textContent (exclusive). */
  endOffset: number;
  /** The selected text — used to display the note and to detect anchor drift. */
  quote: string;
  note: string | null;
}
```

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm typecheck`
Expected: no errors.

```bash
git add supabase/migrations/0006_highlights.sql lib/types.ts
git commit -m "feat(highlights): add highlights table, RLS, and Highlight type"  # (+ trailers)
```

---

## Task 2: Row mappers + Zod input schema (`lib/db/highlightRow.ts`)

**Files:**
- Create: `lib/db/highlightRow.ts`
- Test: `tests/db/highlightRow.test.ts`

**Interfaces:**
- Consumes: `Highlight` (Task 1).
- Produces:
  - `interface HighlightRow { id; paper_id; block_anchor; start_offset; end_offset; quote; note }`
  - `const NOTE_MAX = 2000`, `const QUOTE_MAX = 1000`
  - `highlightInputSchema` (Zod) + `type HighlightInput`
  - `rowToHighlight(row: HighlightRow): Highlight`
  - `highlightInsert(userId: string, input: HighlightInput): { user_id; paper_id; block_anchor; start_offset; end_offset; quote; note }`

- [ ] **Step 1: Write the failing test**

Create `tests/db/highlightRow.test.ts`:

```ts
import { test, expect } from "vitest";
import {
  rowToHighlight,
  highlightInsert,
  highlightInputSchema,
  type HighlightRow,
} from "@/lib/db/highlightRow";

const ROW: HighlightRow = {
  id: "h1",
  paper_id: "p1",
  block_anchor: "12",
  start_offset: 3,
  end_offset: 9,
  quote: "sample",
  note: "a note",
};

test("rowToHighlight maps snake_case columns to the camelCase app shape", () => {
  expect(rowToHighlight(ROW)).toEqual({
    id: "h1",
    paperId: "p1",
    blockAnchor: "12",
    startOffset: 3,
    endOffset: 9,
    quote: "sample",
    note: "a note",
  });
});

test("highlightInsert builds the row payload with the user id and null note default", () => {
  expect(
    highlightInsert("user-1", {
      paperId: "p1",
      blockAnchor: "12",
      startOffset: 3,
      endOffset: 9,
      quote: "sample",
    }),
  ).toEqual({
    user_id: "user-1",
    paper_id: "p1",
    block_anchor: "12",
    start_offset: 3,
    end_offset: 9,
    quote: "sample",
    note: null,
  });
});

test("schema rejects an empty selection (end <= start)", () => {
  const r = highlightInputSchema.safeParse({
    paperId: "p1",
    blockAnchor: "12",
    startOffset: 5,
    endOffset: 5,
    quote: "x",
  });
  expect(r.success).toBe(false);
});

test("schema rejects a quote that is too long", () => {
  const r = highlightInputSchema.safeParse({
    paperId: "p1",
    blockAnchor: "12",
    startOffset: 0,
    endOffset: 1,
    quote: "x".repeat(1001),
  });
  expect(r.success).toBe(false);
});

test("schema accepts a valid input with an optional note", () => {
  const r = highlightInputSchema.safeParse({
    paperId: "p1",
    blockAnchor: "12",
    startOffset: 0,
    endOffset: 4,
    quote: "test",
    note: "hi",
  });
  expect(r.success).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test highlightRow`
Expected: FAIL — cannot find module `@/lib/db/highlightRow`.

- [ ] **Step 3: Write the implementation**

Create `lib/db/highlightRow.ts` (mirror the Zod import style of `lib/env.ts`):

```ts
import { z } from "zod";
import type { Highlight } from "@/lib/types";

export const NOTE_MAX = 2000;
export const QUOTE_MAX = 1000;

/** A row of the `highlights` table as read back from Postgres. */
export interface HighlightRow {
  id: string;
  paper_id: string;
  block_anchor: string;
  start_offset: number;
  end_offset: number;
  quote: string;
  note: string | null;
}

/** The validated payload a client sends to create a highlight. */
export const highlightInputSchema = z
  .object({
    paperId: z.string().min(1),
    blockAnchor: z.string().min(1),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    quote: z.string().min(1).max(QUOTE_MAX),
    note: z.string().max(NOTE_MAX).nullable().optional(),
  })
  .refine((v) => v.endOffset > v.startOffset, {
    message: "endOffset must be greater than startOffset",
    path: ["endOffset"],
  });

export type HighlightInput = z.infer<typeof highlightInputSchema>;

/** Map a DB row to the app-facing Highlight shape. */
export function rowToHighlight(row: HighlightRow): Highlight {
  return {
    id: row.id,
    paperId: row.paper_id,
    blockAnchor: row.block_anchor,
    startOffset: row.start_offset,
    endOffset: row.end_offset,
    quote: row.quote,
    note: row.note,
  };
}

/** Build the insert payload for a new highlight row. */
export function highlightInsert(userId: string, input: HighlightInput) {
  return {
    user_id: userId,
    paper_id: input.paperId,
    block_anchor: input.blockAnchor,
    start_offset: input.startOffset,
    end_offset: input.endOffset,
    quote: input.quote,
    note: input.note ?? null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test highlightRow`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db/highlightRow.ts tests/db/highlightRow.test.ts
git commit -m "feat(highlights): row mappers + zod input schema"  # (+ trailers)
```

---

## Task 3: Pure offset math (`lib/reader/highlightRange.ts` — part 1)

**Files:**
- Create: `lib/reader/highlightRange.ts`
- Test: `tests/reader/highlightRange.test.ts`

**Interfaces:**
- Produces:
  - `absoluteOffset(nodeLengths: number[], nodeIndex: number, offsetInNode: number): number`
  - `interface WrapSpan { nodeIndex: number; from: number; to: number }`
  - `rangesToWrap(nodeLengths: number[], start: number, end: number): WrapSpan[]`

- [ ] **Step 1: Write the failing test**

Create `tests/reader/highlightRange.test.ts`:

```ts
import { test, expect } from "vitest";
import { absoluteOffset, rangesToWrap } from "@/lib/reader/highlightRange";

test("absoluteOffset sums prior node lengths plus the in-node offset", () => {
  expect(absoluteOffset([5, 3, 8], 0, 2)).toBe(2);
  expect(absoluteOffset([5, 3, 8], 1, 1)).toBe(6); // 5 + 1
  expect(absoluteOffset([5, 3, 8], 2, 4)).toBe(12); // 5 + 3 + 4
});

test("rangesToWrap covers a single node", () => {
  expect(rangesToWrap([10], 2, 6)).toEqual([{ nodeIndex: 0, from: 2, to: 6 }]);
});

test("rangesToWrap splits a range across multiple nodes", () => {
  // nodes: [0..5) [5..8) [8..16); range [3, 12)
  expect(rangesToWrap([5, 3, 8], 3, 12)).toEqual([
    { nodeIndex: 0, from: 3, to: 5 },
    { nodeIndex: 1, from: 0, to: 3 },
    { nodeIndex: 2, from: 0, to: 4 },
  ]);
});

test("rangesToWrap omits nodes fully outside the range", () => {
  expect(rangesToWrap([4, 4, 4], 5, 7)).toEqual([{ nodeIndex: 1, from: 1, to: 3 }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test highlightRange`
Expected: FAIL — cannot find module `@/lib/reader/highlightRange`.

- [ ] **Step 3: Write the implementation**

Create `lib/reader/highlightRange.ts`:

```ts
/**
 * Highlight anchoring for the HTML reader. Offsets are character indices into a
 * block's normalized textContent (the in-order concatenation of its descendant
 * text nodes). The same text-node walk is used at creation and at render time,
 * so offsets stay consistent across inline markup (<em>, <a>, <code>).
 */

/** Sum of text-node lengths before nodeIndex, plus the in-node offset. */
export function absoluteOffset(
  nodeLengths: number[],
  nodeIndex: number,
  offsetInNode: number,
): number {
  let total = 0;
  for (let i = 0; i < nodeIndex; i++) total += nodeLengths[i] ?? 0;
  return total + offsetInNode;
}

export interface WrapSpan {
  nodeIndex: number;
  from: number;
  to: number;
}

/**
 * Given a block's text-node lengths (document order) and an absolute [start, end)
 * range over their concatenation, return the per-node sub-spans the range covers.
 * Nodes fully outside the range are omitted; the offsets in each span are local
 * to that node.
 */
export function rangesToWrap(nodeLengths: number[], start: number, end: number): WrapSpan[] {
  const spans: WrapSpan[] = [];
  let pos = 0;
  for (let i = 0; i < nodeLengths.length; i++) {
    const len = nodeLengths[i] ?? 0;
    const nodeStart = pos;
    const nodeEnd = pos + len;
    const from = Math.max(start, nodeStart);
    const to = Math.min(end, nodeEnd);
    if (to > from) spans.push({ nodeIndex: i, from: from - nodeStart, to: to - nodeStart });
    pos = nodeEnd;
  }
  return spans;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test highlightRange`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/reader/highlightRange.ts tests/reader/highlightRange.test.ts
git commit -m "feat(highlights): pure offset math (absoluteOffset, rangesToWrap)"  # (+ trailers)
```

---

## Task 4: DOM adapters (`lib/reader/highlightRange.ts` — part 2)

**Files:**
- Modify: `lib/reader/highlightRange.ts` (append DOM helpers)
- Test: `tests/reader/highlightRange.test.ts` (append jsdom cases)

**Interfaces:**
- Consumes: `absoluteOffset`, `rangesToWrap`, `WrapSpan` (Task 3); `Highlight` (Task 1).
- Produces:
  - `textNodesOf(block: Element): Text[]`
  - `offsetsFromSelection(block: Element, range: Range): { start: number; end: number; quote: string } | null`
  - `interface DecorateTarget { id: string; startOffset: number; endOffset: number; quote: string; hasNote: boolean }`
  - `MARK_CLASS = "pd-highlight"` (exported const)
  - `decorateBlock(block: Element, highlights: DecorateTarget[], onClick: (id: string) => void): void`
  - `clearHighlights(root: Element): void`

- [ ] **Step 1: Write the failing test (append to the existing file)**

Append to `tests/reader/highlightRange.test.ts`:

```ts
import {
  offsetsFromSelection,
  decorateBlock,
  clearHighlights,
  MARK_CLASS,
  type DecorateTarget,
} from "@/lib/reader/highlightRange";

function block(html: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-blk", "0");
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

function selectRange(node: Node, start: number, end: number): Range {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  return range;
}

test("offsetsFromSelection returns offsets + quote across inline markup", () => {
  // textContent = "Diffusion models are great"  (em wraps "models")
  const el = block("Diffusion <em>models</em> are great");
  const emText = el.querySelector("em")!.firstChild!; // "models"
  const r = selectRange(emText, 0, 6); // "models"
  expect(offsetsFromSelection(el, r)).toEqual({ start: 10, end: 16, quote: "models" });
});

test("offsetsFromSelection returns null for a collapsed selection", () => {
  const el = block("hello world");
  const r = selectRange(el.firstChild!, 3, 3);
  expect(offsetsFromSelection(el, r)).toBeNull();
});

test("offsetsFromSelection clamps an end that runs past the block", () => {
  const el = block("abcdef");
  const r = document.createRange();
  r.setStart(el.firstChild!, 2);
  r.setEndAfter(el); // end outside the block's text nodes
  const res = offsetsFromSelection(el, r);
  expect(res).toEqual({ start: 2, end: 6, quote: "cdef" });
});

test("decorateBlock wraps the range in a mark and skips drifted quotes", () => {
  const el = block("Diffusion models are great");
  const targets: DecorateTarget[] = [
    { id: "h1", startOffset: 10, endOffset: 16, quote: "models", hasNote: true },
    { id: "h2", startOffset: 0, endOffset: 9, quote: "STALE!!!", hasNote: false }, // drift → skip
  ];
  const clicked: string[] = [];
  decorateBlock(el, targets, (id) => clicked.push(id));

  const marks = el.querySelectorAll(`mark.${MARK_CLASS}`);
  expect(marks.length).toBe(1);
  expect(marks[0].textContent).toBe("models");
  expect((marks[0] as HTMLElement).dataset.hlId).toBe("h1");
  expect((marks[0] as HTMLElement).dataset.hlNote).toBe("1");

  (marks[0] as HTMLElement).click();
  expect(clicked).toEqual(["h1"]);
});

test("clearHighlights removes marks and restores plain text", () => {
  const el = block("Diffusion models are great");
  decorateBlock(el, [{ id: "h1", startOffset: 10, endOffset: 16, quote: "models", hasNote: false }], () => {});
  expect(el.querySelectorAll(`mark.${MARK_CLASS}`).length).toBe(1);
  clearHighlights(el);
  expect(el.querySelectorAll(`mark.${MARK_CLASS}`).length).toBe(0);
  expect(el.textContent).toBe("Diffusion models are great");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test highlightRange`
Expected: FAIL — `offsetsFromSelection`/`decorateBlock`/`clearHighlights`/`MARK_CLASS` not exported.

- [ ] **Step 3: Write the implementation (append to `lib/reader/highlightRange.ts`)**

```ts
export const MARK_CLASS = "pd-highlight";

/** Ordered descendant text nodes of a block (includes those inside <math>). */
export function textNodesOf(block: Element): Text[] {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  return nodes;
}

function isInsideMath(node: Node): boolean {
  let el: Element | null = node.parentElement;
  while (el) {
    if (el.tagName.toLowerCase() === "math") return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * Compute {start, end, quote} for a selection Range, as offsets into the block's
 * textContent, clamped to the block. Returns null when the selection is collapsed,
 * starts outside the block, has non-text endpoints, or its endpoints are inside a
 * <math> subtree.
 */
export function offsetsFromSelection(
  block: Element,
  range: Range,
): { start: number; end: number; quote: string } | null {
  if (range.collapsed) return null;
  const nodes = textNodesOf(block);
  if (nodes.length === 0) return null;
  const lengths = nodes.map((t) => t.data.length);

  const startIdx = nodes.indexOf(range.startContainer as Text);
  if (startIdx === -1 || isInsideMath(nodes[startIdx])) return null;
  const start = absoluteOffset(lengths, startIdx, range.startOffset);

  const total = lengths.reduce((a, b) => a + b, 0);
  const endIdx = nodes.indexOf(range.endContainer as Text);
  let end: number;
  if (endIdx === -1) {
    end = total; // selection runs past this block — clamp to its end
  } else {
    if (isInsideMath(nodes[endIdx])) return null;
    end = absoluteOffset(lengths, endIdx, range.endOffset);
  }
  if (end <= start) return null;

  const quote = nodes.map((t) => t.data).join("").slice(start, end);
  if (!quote) return null;
  return { start, end, quote };
}

export interface DecorateTarget {
  id: string;
  startOffset: number;
  endOffset: number;
  quote: string;
  hasNote: boolean;
}

/**
 * Paint each highlight as a <mark> inside the block. Recomputes text nodes per
 * highlight (so already-painted marks are accounted for), skips a highlight whose
 * quote no longer matches the live slice (drift), and skips sub-spans inside <math>.
 */
export function decorateBlock(
  block: Element,
  highlights: DecorateTarget[],
  onClick: (id: string) => void,
): void {
  for (const h of highlights) {
    const nodes = textNodesOf(block);
    const lengths = nodes.map((t) => t.data.length);
    const text = nodes.map((t) => t.data).join("");
    if (text.slice(h.startOffset, h.endOffset) !== h.quote) continue; // drift — skip

    // Resolve to concrete node references BEFORE mutating; each is wrapped once,
    // so wrapping one (which splits only that text node) never invalidates another.
    const targets = rangesToWrap(lengths, h.startOffset, h.endOffset)
      .map((s) => ({ node: nodes[s.nodeIndex], from: s.from, to: s.to }))
      .filter((t) => t.node && !isInsideMath(t.node));
    for (const t of targets) wrapTextRange(t.node, t.from, t.to, h, onClick);
  }
}

function wrapTextRange(
  node: Text,
  from: number,
  to: number,
  h: DecorateTarget,
  onClick: (id: string) => void,
): void {
  const range = document.createRange();
  range.setStart(node, from);
  range.setEnd(node, to);
  const mark = document.createElement("mark");
  mark.className = MARK_CLASS;
  mark.dataset.hlId = h.id;
  if (h.hasNote) mark.dataset.hlNote = "1";
  mark.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick(h.id);
  });
  range.surroundContents(mark);
}

/** Unwrap every highlight mark under root, restoring plain text. */
export function clearHighlights(root: Element): void {
  root.querySelectorAll(`mark.${MARK_CLASS}`).forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize(); // merge the split text nodes back together
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test highlightRange`
Expected: PASS (9 tests total).

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm typecheck`
Expected: no errors.

```bash
git add lib/reader/highlightRange.ts tests/reader/highlightRange.test.ts
git commit -m "feat(highlights): DOM adapters — selection offsets, decorate, clear"  # (+ trailers)
```

---

## Task 5: Server actions (`app/actions/highlights.ts`)

**Files:**
- Create: `app/actions/highlights.ts`
- Test: `tests/actions/highlights.test.ts`

**Interfaces:**
- Consumes: `serverClient` (`@/lib/db/server`), `currentUser` (`@/lib/auth`), `highlightInputSchema`/`highlightInsert`/`rowToHighlight`/`NOTE_MAX`/`HighlightInput`/`HighlightRow` (Task 2), `Highlight` (Task 1).
- Produces:
  - `loadHighlights(paperId: string): Promise<Highlight[]>`
  - `createHighlight(input: HighlightInput): Promise<Highlight | null>`
  - `updateHighlightNote(id: string, note: string | null): Promise<void>`
  - `deleteHighlight(id: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `tests/actions/highlights.test.ts` (chainable Supabase mock, mirroring `tests/actions/star.test.ts`):

```ts
import { test, expect, vi, beforeEach } from "vitest";
import type { User } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => {
  // select(...).eq(...).eq(...).order(...) -> { data, error }
  const order = vi.fn(async () => ({ data: [] as unknown[], error: null }));
  const selectEq2 = vi.fn(() => ({ order }));
  const selectEq1 = vi.fn(() => ({ eq: selectEq2 }));
  const select = vi.fn(() => ({ eq: selectEq1 }));
  // insert(...).select(...).single() -> { data, error }
  const single = vi.fn(async () => ({ data: null as unknown, error: null as unknown }));
  const insertSelect = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select: insertSelect }));
  // update(...).eq(...).eq(...) -> { error }
  const updateEq2 = vi.fn(async () => ({ error: null }));
  const updateEq1 = vi.fn(() => ({ eq: updateEq2 }));
  const update = vi.fn(() => ({ eq: updateEq1 }));
  // delete().eq(...).eq(...) -> { error }
  const deleteEq2 = vi.fn(async () => ({ error: null }));
  const deleteEq1 = vi.fn(() => ({ eq: deleteEq2 }));
  const del = vi.fn(() => ({ eq: deleteEq1 }));

  const from = vi.fn(() => ({ select, insert, update, delete: del }));
  return {
    order, single, insert, insertSelect, update, updateEq2, del, deleteEq2, from,
    currentUser: vi.fn(async (): Promise<User | null> => null),
  };
});

vi.mock("@/lib/auth", () => ({ currentUser: mocks.currentUser }));
vi.mock("@/lib/db/server", () => ({ serverClient: async () => ({ from: mocks.from }) }));

import {
  loadHighlights,
  createHighlight,
  deleteHighlight,
} from "@/app/actions/highlights";

const USER = { id: "user-1" } as User;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentUser.mockResolvedValue(USER);
});

test("loadHighlights returns [] and skips the DB when signed out", async () => {
  mocks.currentUser.mockResolvedValue(null);
  expect(await loadHighlights("p1")).toEqual([]);
  expect(mocks.from).not.toHaveBeenCalled();
});

test("loadHighlights maps returned rows to the app shape", async () => {
  mocks.order.mockResolvedValue({
    data: [
      { id: "h1", paper_id: "p1", block_anchor: "2", start_offset: 0, end_offset: 4, quote: "test", note: null },
    ],
    error: null,
  });
  const result = await loadHighlights("p1");
  expect(result).toEqual([
    { id: "h1", paperId: "p1", blockAnchor: "2", startOffset: 0, endOffset: 4, quote: "test", note: null },
  ]);
});

test("createHighlight returns null and skips insert on invalid input", async () => {
  const result = await createHighlight({
    paperId: "p1", blockAnchor: "2", startOffset: 5, endOffset: 5, quote: "x", // end <= start
  });
  expect(result).toBeNull();
  expect(mocks.insert).not.toHaveBeenCalled();
});

test("createHighlight inserts and returns the mapped row on success", async () => {
  mocks.single.mockResolvedValue({
    data: { id: "h9", paper_id: "p1", block_anchor: "2", start_offset: 0, end_offset: 4, quote: "test", note: null },
    error: null,
  });
  const result = await createHighlight({
    paperId: "p1", blockAnchor: "2", startOffset: 0, endOffset: 4, quote: "test",
  });
  expect(result).toEqual({
    id: "h9", paperId: "p1", blockAnchor: "2", startOffset: 0, endOffset: 4, quote: "test", note: null,
  });
  expect(mocks.insert).toHaveBeenCalledWith({
    user_id: "user-1", paper_id: "p1", block_anchor: "2", start_offset: 0, end_offset: 4, quote: "test", note: null,
  });
});

test("deleteHighlight is a no-op when signed out", async () => {
  mocks.currentUser.mockResolvedValue(null);
  await deleteHighlight("h1");
  expect(mocks.from).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test actions/highlights`
Expected: FAIL — cannot find module `@/app/actions/highlights`.

- [ ] **Step 3: Write the implementation**

Create `app/actions/highlights.ts`:

```ts
"use server";

import { serverClient } from "@/lib/db/server";
import { currentUser } from "@/lib/auth";
import type { Highlight } from "@/lib/types";
import {
  highlightInputSchema,
  highlightInsert,
  rowToHighlight,
  NOTE_MAX,
  type HighlightInput,
  type HighlightRow,
} from "@/lib/db/highlightRow";

const HL_COLS = "id, paper_id, block_anchor, start_offset, end_offset, quote, note";

/** All of the current user's highlights for a paper (oldest first). Empty when signed out. */
export async function loadHighlights(paperId: string): Promise<Highlight[]> {
  const user = await currentUser();
  if (!user) return [];
  const db = await serverClient();
  const { data } = await db
    .from("highlights")
    .select(HL_COLS)
    .eq("user_id", user.id)
    .eq("paper_id", paperId)
    .order("created_at", { ascending: true });
  return ((data as HighlightRow[] | null) ?? []).map(rowToHighlight);
}

/** Create a highlight; returns the saved row (with id) for optimistic painting, or null. */
export async function createHighlight(input: HighlightInput): Promise<Highlight | null> {
  const user = await currentUser();
  if (!user) return null;
  const parsed = highlightInputSchema.safeParse(input);
  if (!parsed.success) return null;
  const db = await serverClient();
  const { data, error } = await db
    .from("highlights")
    .insert(highlightInsert(user.id, parsed.data))
    .select(HL_COLS)
    .single();
  if (error || !data) return null;
  return rowToHighlight(data as HighlightRow);
}

/** Set (or clear) the note on a highlight the user owns. */
export async function updateHighlightNote(id: string, note: string | null): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const capped = note && note.length > NOTE_MAX ? note.slice(0, NOTE_MAX) : note;
  const db = await serverClient();
  await db
    .from("highlights")
    .update({ note: capped ?? null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
}

/** Delete a highlight the user owns. */
export async function deleteHighlight(id: string): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const db = await serverClient();
  await db.from("highlights").delete().eq("id", id).eq("user_id", user.id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test actions/highlights`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app/actions/highlights.ts tests/actions/highlights.test.ts
git commit -m "feat(highlights): server actions (load/create/updateNote/delete)"  # (+ trailers)
```

---

## Task 6: `HighlightLayer` component

**Files:**
- Create: `components/HighlightLayer.tsx`
- Test: `tests/components/HighlightLayer.test.tsx`

**Interfaces:**
- Consumes: `offsetsFromSelection`, `decorateBlock`, `clearHighlights`, `MARK_CLASS`, `DecorateTarget` (Task 4); `createHighlight`, `updateHighlightNote`, `deleteHighlight` (Task 5); `Highlight` (Task 1); `Button` (`@/components/ui`).
- Produces: `HighlightLayer({ paperId, containerRef, initialHighlights }): JSX.Element` where `containerRef: React.RefObject<HTMLDivElement | null>`.

- [ ] **Step 1: Write the failing test**

Create `tests/components/HighlightLayer.test.tsx`:

```tsx
import { test, expect, vi, beforeEach } from "vitest";
import { useRef } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";

const actions = vi.hoisted(() => ({
  createHighlight: vi.fn(),
  updateHighlightNote: vi.fn(async () => {}),
  deleteHighlight: vi.fn(async () => {}),
}));
vi.mock("@/app/actions/highlights", () => actions);

import { HighlightLayer } from "@/components/HighlightLayer";
import type { Highlight } from "@/lib/types";

const HTML = `<p data-blk="0">Diffusion models are great</p>`;

function Harness({ initial }: { initial: Highlight[] }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div>
      <div ref={ref} dangerouslySetInnerHTML={{ __html: HTML }} />
      <HighlightLayer paperId="p1" containerRef={ref} initialHighlights={initial} />
    </div>
  );
}

function selectText(container: HTMLElement, from: number, to: number) {
  const p = container.querySelector('[data-blk="0"]')!;
  const textNode = p.firstChild!;
  const range = document.createRange();
  range.setStart(textNode, from);
  range.setEnd(textNode, to);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  fireEvent.mouseUp(document);
}

beforeEach(() => {
  vi.clearAllMocks();
});

test("an initial highlight is painted as a mark on mount", () => {
  const { container } = render(
    <Harness initial={[{ id: "h1", paperId: "p1", blockAnchor: "0", startOffset: 10, endOffset: 16, quote: "models", note: "hi" }]} />,
  );
  const mark = container.querySelector("mark.pd-highlight");
  expect(mark).not.toBeNull();
  expect(mark!.textContent).toBe("models");
});

test("selecting text shows the Highlight button; clicking it creates and paints a highlight", async () => {
  actions.createHighlight.mockResolvedValue({
    id: "h2", paperId: "p1", blockAnchor: "0", startOffset: 10, endOffset: 16, quote: "models", note: null,
  });
  const { container } = render(<Harness initial={[]} />);

  selectText(container, 10, 16); // "models"
  const btn = await screen.findByRole("button", { name: /highlight/i });

  await act(async () => {
    fireEvent.click(btn);
  });

  expect(actions.createHighlight).toHaveBeenCalledWith({
    paperId: "p1", blockAnchor: "0", startOffset: 10, endOffset: 16, quote: "models", note: null,
  });
  expect(container.querySelector('mark.pd-highlight[data-hl-id="h2"]')).not.toBeNull();
});

test("clicking an existing mark opens the note editor; saving calls updateHighlightNote", async () => {
  const { container } = render(
    <Harness initial={[{ id: "h1", paperId: "p1", blockAnchor: "0", startOffset: 10, endOffset: 16, quote: "models", note: null }]} />,
  );
  const mark = container.querySelector("mark.pd-highlight")!;

  await act(async () => {
    fireEvent.click(mark);
  });
  const textarea = await screen.findByRole("textbox");
  fireEvent.change(textarea, { target: { value: "key idea" } });

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
  });
  expect(actions.updateHighlightNote).toHaveBeenCalledWith("h1", "key idea");
});

test("deleting from the editor calls deleteHighlight and removes the mark", async () => {
  const { container } = render(
    <Harness initial={[{ id: "h1", paperId: "p1", blockAnchor: "0", startOffset: 10, endOffset: 16, quote: "models", note: null }]} />,
  );
  await act(async () => {
    fireEvent.click(container.querySelector("mark.pd-highlight")!);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
  });
  expect(actions.deleteHighlight).toHaveBeenCalledWith("h1");
  expect(container.querySelector("mark.pd-highlight")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test HighlightLayer`
Expected: FAIL — cannot find module `@/components/HighlightLayer`.

- [ ] **Step 3: Write the implementation**

Create `components/HighlightLayer.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { createHighlight, deleteHighlight, updateHighlightNote } from "@/app/actions/highlights";
import {
  offsetsFromSelection,
  decorateBlock,
  clearHighlights,
  MARK_CLASS,
  type DecorateTarget,
} from "@/lib/reader/highlightRange";
import { Button } from "@/components/ui";
import type { Highlight } from "@/lib/types";

type Pending = { x: number; y: number; blockAnchor: string; start: number; end: number; quote: string };
type Editing = { id: string; x: number; y: number };

export function HighlightLayer({
  paperId,
  containerRef,
  initialHighlights,
}: {
  paperId: string;
  containerRef: RefObject<HTMLDivElement | null>;
  initialHighlights: Highlight[];
}) {
  const [highlights, setHighlights] = useState<Highlight[]>(initialHighlights);
  const [pending, setPending] = useState<Pending | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  // Keep a ref so click handlers bound into the DOM read current highlights
  // without changing identity (which would thrash the repaint effect).
  const hlRef = useRef(highlights);
  useEffect(() => {
    hlRef.current = highlights;
  }, [highlights]);

  const openEditor = useCallback(
    (id: string) => {
      const root = containerRef.current;
      const mark = root?.querySelector<HTMLElement>(`mark.${MARK_CLASS}[data-hl-id="${id}"]`);
      const rect = mark?.getBoundingClientRect();
      const h = hlRef.current.find((x) => x.id === id);
      setEditing({ id, x: rect?.left ?? 0, y: rect?.bottom ?? 0 });
      setNoteDraft(h?.note ?? "");
    },
    [containerRef],
  );

  // (Re)paint marks whenever the highlight set changes.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    clearHighlights(root);
    const byBlock = new Map<string, DecorateTarget[]>();
    for (const h of highlights) {
      const target: DecorateTarget = {
        id: h.id,
        startOffset: h.startOffset,
        endOffset: h.endOffset,
        quote: h.quote,
        hasNote: !!h.note,
      };
      const arr = byBlock.get(h.blockAnchor) ?? [];
      arr.push(target);
      byBlock.set(h.blockAnchor, arr);
    }
    for (const [blk, targets] of byBlock) {
      const block = root.querySelector(`[data-blk="${blk}"]`);
      if (block) decorateBlock(block, targets, openEditor);
    }
    return () => clearHighlights(root);
  }, [highlights, containerRef, openEditor]);

  // Show the "Highlight" button when a fresh selection sits inside one block.
  useEffect(() => {
    function onMouseUp() {
      const root = containerRef.current;
      const sel = window.getSelection();
      if (!root || !sel || sel.isCollapsed || sel.rangeCount === 0) {
        setPending(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const block = (range.startContainer.parentElement ?? null)?.closest("[data-blk]");
      if (!block || !root.contains(block)) {
        setPending(null);
        return;
      }
      // No overlaps in v1: ignore selections that touch an existing mark.
      if (range.cloneContents().querySelector(`mark.${MARK_CLASS}`)) {
        setPending(null);
        return;
      }
      const offsets = offsetsFromSelection(block, range);
      if (!offsets) {
        setPending(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setPending({
        x: rect.left + rect.width / 2,
        y: rect.top,
        blockAnchor: block.getAttribute("data-blk") ?? "",
        start: offsets.start,
        end: offsets.end,
        quote: offsets.quote,
      });
    }
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [containerRef]);

  async function confirmHighlight() {
    if (!pending) return;
    const created = await createHighlight({
      paperId,
      blockAnchor: pending.blockAnchor,
      startOffset: pending.start,
      endOffset: pending.end,
      quote: pending.quote,
      note: null,
    });
    setPending(null);
    window.getSelection()?.removeAllRanges();
    if (created) setHighlights((hs) => [...hs, created]);
  }

  async function saveNote() {
    if (!editing) return;
    const note = noteDraft.trim() || null;
    await updateHighlightNote(editing.id, note);
    setHighlights((hs) => hs.map((h) => (h.id === editing.id ? { ...h, note } : h)));
    setEditing(null);
  }

  async function removeHighlight() {
    if (!editing) return;
    await deleteHighlight(editing.id);
    setHighlights((hs) => hs.filter((h) => h.id !== editing.id));
    setEditing(null);
  }

  return (
    <>
      {pending && (
        <div
          className="pd-enter fixed z-30 -translate-x-1/2 -translate-y-full pb-2"
          style={{ left: pending.x, top: pending.y }}
        >
          <Button variant="primary" className="h-8 px-3 text-xs shadow-md" onClick={confirmHighlight}>
            Highlight
          </Button>
        </div>
      )}

      {editing && (
        <div
          className="pd-enter fixed z-30 w-72 rounded-xl border border-line bg-card p-3 shadow-lg"
          style={{ left: editing.x, top: editing.y + 6 }}
        >
          <textarea
            aria-label="Note"
            className="h-24 w-full resize-none rounded-md border border-line bg-background p-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            placeholder="Add a note…"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
          />
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={removeHighlight}
              className="text-xs font-medium text-danger hover:underline"
            >
              Delete
            </button>
            <div className="flex gap-2">
              <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button variant="primary" className="h-8 px-3 text-xs" onClick={saveNote}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test HighlightLayer`
Expected: PASS (4 tests).

> If `range.getBoundingClientRect`/`cloneContents` behave oddly under jsdom, the tests above only rely on element presence (not pixel positions), so they remain valid. Do not loosen an assertion to make a real failure pass — debug the component instead.

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm typecheck`
Expected: no errors.

```bash
git add components/HighlightLayer.tsx tests/components/HighlightLayer.test.tsx
git commit -m "feat(highlights): HighlightLayer — selection toolbar, decoration, note popover"  # (+ trailers)
```

---

## Task 7: Wire into the reader + styles

**Files:**
- Modify: `components/HtmlReader.tsx` (add `initialHighlights` prop + mount `HighlightLayer`)
- Modify: `components/ReaderView.tsx` (thread `initialHighlights`)
- Modify: `app/reader/[id]/page.tsx` (load highlights server-side)
- Modify: `app/globals.css` (`.pd-highlight` styles + token)
- Modify: `tests/components/HtmlReader.test.tsx` (mock highlights actions + integration assertion)

**Interfaces:**
- Consumes: `HighlightLayer` (Task 6), `loadHighlights` (Task 5), `Highlight` (Task 1).
- Produces: `HtmlReader` and `ReaderView` both accept `initialHighlights?: Highlight[]` (default `[]`).

- [ ] **Step 1: Update the HtmlReader test (add mock + integration assertion)**

In `tests/components/HtmlReader.test.tsx`, after the existing `vi.mock("@/app/actions/progress", …)` line, add:

```ts
vi.mock("@/app/actions/highlights", () => ({
  loadHighlights: vi.fn(async () => []),
  createHighlight: vi.fn(),
  updateHighlightNote: vi.fn(async () => {}),
  deleteHighlight: vi.fn(async () => {}),
}));
```

Then append a new test:

```ts
test("paints an initial highlight passed to the reader", () => {
  const { container } = render(
    <HtmlReader
      paperId="p1"
      html={HTML}
      initialProgress={null}
      initialHighlights={[
        { id: "h1", paperId: "p1", blockAnchor: "1", startOffset: 0, endOffset: 4, quote: "Beta", note: null },
      ]}
    />,
  );
  expect(container.querySelector('mark.pd-highlight[data-hl-id="h1"]')?.textContent).toBe("Beta");
});
```

- [ ] **Step 2: Run the test to verify the new case fails**

Run: `pnpm test HtmlReader`
Expected: FAIL — `HtmlReader` does not accept `initialHighlights` / no mark rendered.

- [ ] **Step 3: Wire `HighlightLayer` into `HtmlReader`**

In `components/HtmlReader.tsx`:

Add imports near the top:

```tsx
import { HighlightLayer } from "@/components/HighlightLayer";
import type { ProgressRow, Highlight } from "@/lib/types";
```

(Replace the existing `import type { ProgressRow } from "@/lib/types";` line with the combined import above.)

Add the prop (default `[]`) to the component signature:

```tsx
export function HtmlReader({
  paperId,
  html,
  initialProgress,
  initialHighlights = [],
}: {
  paperId: string;
  html: string;
  initialProgress: ProgressRow | null;
  initialHighlights?: Highlight[];
}) {
```

Mount the layer inside the existing relative wrapper, right after the content `<div ref={containerRef} …/>`:

```tsx
        <div
          ref={containerRef}
          className="paper-html px-4 pb-28 pt-6"
          dangerouslySetInnerHTML={content}
        />
        <HighlightLayer
          paperId={paperId}
          containerRef={containerRef}
          initialHighlights={initialHighlights}
        />
```

- [ ] **Step 4: Run the HtmlReader test to verify it passes**

Run: `pnpm test HtmlReader`
Expected: PASS (existing tests + the new highlight test).

- [ ] **Step 5: Thread `initialHighlights` through `ReaderView`**

In `components/ReaderView.tsx`:

Update the type import and props:

```tsx
import type { ProgressRow, Highlight } from "@/lib/types";
```

```tsx
export function ReaderView({
  paperId,
  initialProgress,
  initialHighlights,
}: {
  paperId: string;
  initialProgress: ProgressRow | null;
  initialHighlights: Highlight[];
}) {
```

Pass it to the HTML reader (the PDF branch is unchanged — out of scope):

```tsx
  if (payload.kind === "html") {
    return (
      <HtmlReader
        paperId={paperId}
        html={payload.html}
        initialProgress={initialProgress}
        initialHighlights={initialHighlights}
      />
    );
  }
```

- [ ] **Step 6: Load highlights in the reader page**

In `app/reader/[id]/page.tsx`:

Add the import:

```tsx
import { loadHighlights } from "@/app/actions/highlights";
```

Load alongside progress and pass to `ReaderView`:

```tsx
  const progress = await loadProgress(id);
  const highlights = await loadHighlights(id);
```

```tsx
      <ReaderView paperId={id} initialProgress={progress} initialHighlights={highlights} />
```

- [ ] **Step 7: Add highlight styles**

In `app/globals.css`, add the token to BOTH `:root` and `[data-theme="dark"]`:

```css
/* in :root */
  --highlight-bg: rgba(217, 164, 65, 0.34);   /* translucent amber */
  --highlight-line: rgba(217, 164, 65, 0.9);
```

```css
/* in [data-theme="dark"] */
  --highlight-bg: rgba(185, 138, 58, 0.40);
  --highlight-line: rgba(185, 138, 58, 0.95);
```

Then append, after the `.paper-html` rules:

```css
/* ---- Reader: user highlights ---- */
mark.pd-highlight {
  background: var(--highlight-bg);
  color: inherit;
  border-radius: 2px;
  padding: 0 0.5px;
  cursor: pointer;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
}
/* highlights that carry a note get a subtle underline cue */
mark.pd-highlight[data-hl-note="1"] {
  text-decoration: underline;
  text-decoration-color: var(--highlight-line);
  text-underline-offset: 3px;
}
```

- [ ] **Step 8: Full verification**

Run: `pnpm typecheck && pnpm test && pnpm lint`
Expected: typecheck clean, all tests pass, lint clean.

- [ ] **Step 9: Manual smoke (optional but recommended)**

Run `pnpm dev` (webpack), open a paper with an HTML reader while signed in, select a sentence → click **Highlight** → reload → the highlight persists → click it → add a note → Save → reload → underline cue shows → click → Delete.

- [ ] **Step 10: Commit**

```bash
git add components/HtmlReader.tsx components/ReaderView.tsx "app/reader/[id]/page.tsx" app/globals.css tests/components/HtmlReader.test.tsx
git commit -m "feat(highlights): wire HighlightLayer into the HTML reader + styles"  # (+ trailers)
```

---

## Self-Review (completed at write time)

**Spec coverage:**
- Data model + RLS → Task 1. ✅
- Text-offset anchoring (block + char offsets into textContent) → Tasks 3–4. ✅
- Drift skip-paint via quote match → Task 4 (`decorateBlock`). ✅
- Single-block clamp; null on collapsed/in-math/non-text endpoints → Task 4 (`offsetsFromSelection`). ✅
- Server actions w/ auth guard + Zod + RLS defense-in-depth → Tasks 2, 5. ✅
- In-reader UX: selection toolbar, click-to-edit note, delete; overlaps disallowed → Task 6. ✅
- Logged-out path: actions return empty/null (reader route is already auth-gated) → Task 5. ✅
- Single color + has-note cue, dark-mode token → Task 7. ✅
- Load `initialHighlights` server-side like `initialProgress` → Task 7. ✅
- Out of scope (PDF, cross-block, multi-color, global page, badges, export, drift recovery) → not implemented. ✅

**Placeholder scan:** none — every code/test step contains complete content.

**Type consistency:** `Highlight`, `HighlightRow`, `HighlightInput`, `DecorateTarget`, `WrapSpan`, `MARK_CLASS`, and all action signatures are defined once and used consistently across tasks. `initialHighlights` is the same prop name in `HtmlReader`, `ReaderView`, and the page.
