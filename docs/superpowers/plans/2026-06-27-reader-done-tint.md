# "Read" tint on the HTML reader — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reintroduce a soft yellow "I read this" wash on the HTML reader, driven by read depth (not blocks), revealed only once a paper is finished and sticky to the deepest point ever reached.

**Architecture:** Add one additive, monotonic column `read_max_pct` to `reading_progress` (independent of the reversible `status`/`read_pct`). Thread it through the progress data layer. In `HtmlReader`, track the running max of read depth, persist it, and render a full-width `--read-tint` wash behind the text whenever `read_max_pct ≥ 0.98`, sized to that depth.

**Tech Stack:** Next.js (custom fork) App Router, React client component, TypeScript, Supabase/Postgres, Vitest + Testing Library (jsdom), Tailwind.

## Global Constraints

- Next.js here is a custom fork — consult `node_modules/next/dist/docs/` before using any unfamiliar Next API. This change reuses the existing server-action + client-component patterns; it introduces no new Next APIs.
- Package manager is **pnpm 10** (`pnpm@10.33.0`); run tests with `pnpm test`.
- Migrations are `alter table ... if not exists` and re-apply-safe. The Supabase ledger uses timestamp versions, not the repo's `000N` prefixes; project id `rrbmucsbqsoyspsoftvl`.
- Use the existing `--read-tint` CSS variable (`#f8f0dc` light / `#2b2414` dark). Do **not** add a new color.
- `status` stays reversible (derived from the **current** `read_pct`). Do **not** derive the tint from `status`.
- No `paper_content` cache bust required — sanitize/fetch are untouched.

---

### Task 1: Persist deepest read depth (`read_max_pct`)

**Files:**
- Create: `supabase/migrations/0007_progress_read_max_pct.sql`
- Modify: `lib/db/progressRow.ts` (add `readMaxPct` to `ProgressUpdate`; write `read_max_pct` in `buildProgressRow`)
- Modify: `lib/types.ts:58-66` (add `readMaxPct` to `ProgressRow`)
- Modify: `app/actions/progress.ts:21-28` (map `read_max_pct` in `loadProgress`)
- Test: `tests/db/progressRow.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `ProgressUpdate.readMaxPct?: number` — optional field consumed by `HtmlReader.persist()` in Task 2.
  - `ProgressRow.readMaxPct: number` — required field seeded by `HtmlReader` in Task 2.
  - `buildProgressRow(userId, paperId, update, now)` writes `read_max_pct` only when `update.readMaxPct !== undefined`.

- [ ] **Step 1: Write the failing test**

Add to `tests/db/progressRow.test.ts` (after the existing `read_pct` test at the end of the file):

```ts
test("writes read_max_pct only when provided", () => {
  expect(buildProgressRow("u1", "p1", { readMaxPct: 0.99 }, NOW).read_max_pct).toBe(0.99);
  expect(buildProgressRow("u1", "p1", { scrollPct: 0.1 }, NOW)).not.toHaveProperty("read_max_pct");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/db/progressRow.test.ts`
Expected: FAIL — `read_max_pct` is `undefined` (not written), so the first `expect(...).toBe(0.99)` fails.

- [ ] **Step 3: Write minimal implementation**

In `lib/db/progressRow.ts`, add the field to the interface and the write line.

Add to the `ProgressUpdate` interface (after `readPct?: number;`):

```ts
  readMaxPct?: number;
```

Add inside `buildProgressRow`, after the `read_pct` line (`if (update.readPct !== undefined) row.read_pct = update.readPct;`):

```ts
  if (update.readMaxPct !== undefined) row.read_max_pct = update.readMaxPct;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/db/progressRow.test.ts`
Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 5: Thread the field through the type and loader, and add the migration**

Create `supabase/migrations/0007_progress_read_max_pct.sql`:

```sql
-- reading_progress: the DEEPEST read depth ever reached (monotonic max of read_pct).
--
-- Distinct from `read_pct` (the CURRENT viewport-bottom fraction, which rises and
-- falls with scrolling and drives the reversible rail/status). `read_max_pct` only
-- ever increases, so it can back a sticky "I read this" tint that doesn't retreat
-- when the reader scrolls back up. Additive and safe; existing rows default to 0
-- (no tint until a paper is re-read to the end).
alter table reading_progress add column if not exists read_max_pct real not null default 0;
```

In `lib/types.ts`, add to the `ProgressRow` interface (after the `readPct` field at line 63):

```ts
  /** Deepest read depth ever reached (0–1) — monotonic; drives the sticky "read" tint. */
  readMaxPct: number;
```

In `app/actions/progress.ts`, add to the object returned by `loadProgress` (after `readPct: data.read_pct ?? 0,`):

```ts
    readMaxPct: data.read_max_pct ?? 0,
```

- [ ] **Step 6: Run the full suite to verify no regressions**

Run: `pnpm test`
Expected: PASS. (The new required `ProgressRow.readMaxPct` is only constructed by `loadProgress` and by test fixtures; the one existing fixture that builds a `ProgressRow` literal is updated in Task 2. Vitest transpiles without type-checking, so the suite is green now; the fixture update keeps `tsc` honest.)

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0007_progress_read_max_pct.sql lib/db/progressRow.ts lib/types.ts app/actions/progress.ts tests/db/progressRow.test.ts
git commit -m "feat(reader): persist read_max_pct (deepest read depth) for the read tint"
```

- [ ] **Step 8 (operational, not a test): apply the migration**

Apply via the Supabase MCP `apply_migration` (name `progress_read_max_pct`, body = the SQL above) against project `rrbmucsbqsoyspsoftvl`, or let the file ship for the next migration run. It is `if not exists`, so re-application is safe. No `paper_content` cache bust is needed.

---

### Task 2: Reveal the sticky read tint in the HTML reader

**Files:**
- Modify: `components/HtmlReader.tsx`
- Test: `tests/components/HtmlReader.test.tsx`

**Interfaces:**
- Consumes (from Task 1): `ProgressRow.readMaxPct`, `ProgressUpdate.readMaxPct`.
- Consumes (existing): `isComplete(readPct)` from `lib/reader/readDepth.ts`, `clamp01` (local).
- Produces: a `[data-testid="read-tint"]` element rendered only when `isComplete(readMaxPct)`, with `style.height = readMaxPct%`.

- [ ] **Step 1: Write the failing tests (and fix the existing fixture)**

First, update the existing fixture in `tests/components/HtmlReader.test.tsx` so the `ProgressRow` literal carries the new required field. In the `"seeds the read rail from the saved read depth"` test, the object passed to `renderReader` gains `readMaxPct: 0`:

```ts
  const { container } = renderReader({
    scrollPct: 0.3,
    blockAnchor: "1",
    markedAnchor: null,
    readerKind: "html",
    status: "reading",
    readPct: 0.5,
    readMaxPct: 0,
  });
```

Then append these tests to the end of `tests/components/HtmlReader.test.tsx`:

```ts
test("hides the read tint until the paper is finished", () => {
  const { container } = renderReader({
    scrollPct: 0.5,
    blockAnchor: "1",
    markedAnchor: null,
    readerKind: "html",
    status: "reading",
    readPct: 0.5,
    readMaxPct: 0.5,
  });
  expect(container.querySelector('[data-testid="read-tint"]')).toBeNull();
});

test("shows the read tint at the deepest read depth once finished", () => {
  const { container } = renderReader({
    scrollPct: 0.9,
    blockAnchor: "2",
    markedAnchor: null,
    readerKind: "html",
    status: "done",
    readPct: 0.99,
    readMaxPct: 0.99,
  });
  const tint = container.querySelector<HTMLElement>('[data-testid="read-tint"]');
  expect(tint).not.toBeNull();
  // 0.99 * 100 is not exactly 99 in IEEE754, so compare numerically, not by string.
  expect(parseFloat(tint!.style.height)).toBeCloseTo(99);
});

test("the read tint appears at the bottom and stays (sticky) when scrolling back up", () => {
  const { container } = renderReader(null);
  const tint = () => container.querySelector<HTMLElement>('[data-testid="read-tint"]');

  // Not finished yet: (300 + 200) / 1000 = 0.5 -> no tint.
  setGeometry(300, 200, 1000);
  fireEvent.scroll(window);
  expect(tint()).toBeNull();

  // Scroll to the bottom (>= 0.98): (790 + 200) / 1000 = 0.99 -> tint appears.
  setGeometry(790, 200, 1000);
  fireEvent.scroll(window);
  expect(tint()).not.toBeNull();
  expect(parseFloat(tint()!.style.height)).toBeCloseTo(99);

  // Scroll back up (0.25): the rail shrinks, but the tint stays at its max.
  setGeometry(50, 200, 1000);
  fireEvent.scroll(window);
  const rail = container.querySelector<HTMLElement>('[data-testid="read-rail"]');
  expect(rail!.style.height).toBe("25%");
  expect(tint()).not.toBeNull();
  expect(parseFloat(tint()!.style.height)).toBeCloseTo(99);
});

test("persists read_max_pct as the running max even after scrolling up", () => {
  vi.useFakeTimers();
  try {
    renderReader(null);

    // Bottom: (790 + 200) / 1000 = 0.99
    setGeometry(790, 200, 1000);
    fireEvent.scroll(window);
    act(() => vi.advanceTimersByTime(600));
    expect(saveProgress.mock.calls.at(-1)?.[1]).toMatchObject({ readMaxPct: 0.99 });

    // Up: current depth (300 + 200) / 1000 = 0.5, but the max stays 0.99.
    setGeometry(300, 200, 1000);
    fireEvent.scroll(window);
    act(() => vi.advanceTimersByTime(600));
    const last = saveProgress.mock.calls.at(-1)?.[1] as Record<string, number>;
    expect(last.readPct).toBe(0.5);
    expect(last.readMaxPct).toBe(0.99);
  } finally {
    vi.useRealTimers();
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/components/HtmlReader.test.tsx`
Expected: FAIL — there is no `[data-testid="read-tint"]` element yet, and `saveProgress` is never called with `readMaxPct`.

- [ ] **Step 3: Write the implementation**

In `components/HtmlReader.tsx`:

(a) After the existing `readPctRef` declaration, add the running-max state + ref:

```tsx
  const readPctRef = useRef(readPct);
  // Deepest read depth ever reached (monotonic). Backs the sticky "read" tint —
  // it does not retreat when the reader scrolls back up. Independent of status.
  const [readMaxPct, setReadMaxPct] = useState(clamp01(initialProgress?.readMaxPct ?? 0));
  const readMaxPctRef = useRef(readMaxPct);
```

(b) In `persist()`, send the max alongside the current depth. Replace the existing `saveProgress` call body so it reads:

```tsx
  const persist = useCallback(() => {
    const depth = readPctRef.current;
    saveProgress(paperId, {
      scrollPct: currentScrollPct(),
      blockAnchor: topBlock(),
      readPct: depth,
      readMaxPct: readMaxPctRef.current,
      readerKind: "html",
      status: isComplete(depth) ? "done" : "reading",
    }).catch(() => {});
  }, [paperId, currentScrollPct, topBlock]);
```

(c) In the scroll handler `onScroll`, bump the max after updating the current depth. Add, right after `setReadPct(frac);`:

```tsx
      if (frac > readMaxPctRef.current) {
        readMaxPctRef.current = frac;
        setReadMaxPct(frac);
      }
```

(d) In the returned markup, add the tint as the first child of the `.relative` wrapper, give the content `relative z-10`, and lift the rail to `z-20`. Replace the wrapper's children so they read:

```tsx
      <div className="relative">
        {/* Read tint: soft yellow wash behind the text, revealed once the paper is
            finished and sized to the deepest read depth. Sticky — it does not
            retreat on scroll-up. Sits behind the text and user highlights (z-0). */}
        {isComplete(readMaxPct) && (
          <div
            data-testid="read-tint"
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 z-0 bg-[var(--read-tint)] transition-opacity duration-300"
            style={{ height: `${clamp01(readMaxPct) * 100}%` }}
          />
        )}
        {/* Read rail: amber bar in the left gutter, filled to the current read depth. */}
        <div
          data-testid="read-rail"
          aria-hidden
          className="pointer-events-none absolute left-1 top-0 z-20 w-[3px] rounded-full bg-[var(--read-accent)] transition-[height] duration-150 ease-linear"
          style={{ height: `${clamp01(readPct) * 100}%` }}
        />
        <div
          ref={containerRef}
          className="paper-html relative z-10 px-4 pb-28 pt-6"
          dangerouslySetInnerHTML={content}
        />
        <HighlightLayer
          paperId={paperId}
          containerRef={containerRef}
          initialHighlights={initialHighlights}
        />
      </div>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/components/HtmlReader.test.tsx`
Expected: PASS (all tests in the file, including the four new ones and the updated fixture).

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/HtmlReader.tsx tests/components/HtmlReader.test.tsx
git commit -m "feat(reader): reveal a sticky yellow read tint when an HTML paper is done"
```

---

## Manual verification (after both tasks)

1. Run the dev server with the webpack flag (Turbopack fork-bombs on Tailwind pages): `pnpm dev --webpack`.
2. Open an HTML paper you have not finished → only the thin amber rail shows, no wash.
3. Scroll to the bottom → a soft yellow wash fades in behind the text, covering the document; the amber rail stays crisp on top, and user highlights remain readable above the wash.
4. Scroll back up → the rail shrinks but the wash stays (sticky). Reload → the wash is still there (persisted via `read_max_pct`).

## Notes / expected outcome

- The shelf and card "% read" are unchanged (still `max(read_pct, scroll_pct)`); the Continue-reading shelf still uses the reversible `status`.
- Old `reading_progress` rows have `read_max_pct = 0`, so finished-long-ago papers show no wash until re-read to the end (then it sticks). Opening such a paper resumes near the bottom, and the resume `scrollTo` fires a scroll event that drives `read_max_pct` to ≈1.0, so the wash appears on the spot.
- PDF reader is untouched.
