# Reader & Sources Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link the Trending feed hint to its Hugging Face source, make the HTML reader's read rail fully reversible (scrolling up un-marks), and pull NeurIPS/ICLR/ICML papers via Semantic Scholar with a per-card venue badge.

**Architecture:** Three independent changes in an existing Next.js 16 / React 19 app with a Supabase-backed shared corpus and Vitest tests. (1) A copy/markup tweak in one server component. (2) A ~3-line behavior change in one client component plus doc/test updates — no schema or server-action change, since the `read_pct` column already exists and `persist()` already sends `status`. (3) A new source adapter following the existing `lib/sources/*` adapter pattern, an additive `venue` column, and a badge on the paper card.

**Tech Stack:** Next.js 16.2.7, React 19, TypeScript, Supabase (Postgres), Vitest + Testing Library + jsdom, Tailwind v4.

**Project conventions to honor:**
- `AGENTS.md`: this is a modified Next.js — consult `node_modules/next/dist/docs/` before using any framework API. (This plan introduces **no new** Next.js APIs; all changes follow existing component patterns.)
- Test runner: `pnpm test` (all), `pnpm vitest run <path>` (one file), `pnpm typecheck`.
- Source adapters expose a pure `parse*`/helper (unit-tested with a fixture) and a thin `fetch*` wrapper (not unit-tested) — mirror that.
- Commit after each task.

---

## File Structure

**Feature 1 — upvotes link**
- Modify: `components/FeedTabs.tsx` — `HINTS` becomes `{ text, href? }`; render an `<a>` for hints with an href.
- Test: `tests/components/FeedTabs.test.tsx` (new).

**Feature 2 — reversible read rail**
- Modify: `components/HtmlReader.tsx:91-104` — scroll handler tracks current depth instead of the session max; update comments at `:24` and `:117`.
- Modify: `lib/reader/readDepth.ts:1-10` — correct the "running max / only increases" doc comments.
- Modify: `docs/superpowers/specs/2026-06-12-scroll-depth-read-rail-design.md` — mark the monotonic "no un-mark" decision as superseded.
- Test: `tests/components/HtmlReader.test.tsx` — add a reversibility test.

**Feature 3 — conference sources + venue badge**
- Modify: `lib/types.ts` — add optional `venue` to `NormalizedPaper` and `PaperRow`; add `"conferences"` to `SourceId`.
- Create: `lib/sources/conferences.ts` — `labelConference()` (pure) + `fetchConferences()` (thin fetch).
- Modify: `lib/corpus/dedupe.ts:29-44` — carry `venue` through the merge.
- Modify: `lib/corpus/upsert.ts:6-23` — map `venue` into the row.
- Modify: `lib/sources/index.ts:1-34` — register the `conferences` source.
- Create: `supabase/migrations/0005_papers_venue.sql` — `alter table papers add column venue`.
- Modify: `components/PaperCard.tsx:24-29` — render a venue badge chip.
- Tests: `tests/sources/conferences.test.ts` (new), `tests/corpus/dedupe.test.ts` (add cases), `tests/corpus/upsert` coverage via a new `tests/corpus/upsert.test.ts` (new), `tests/components/PaperCard.test.tsx` (add cases).

---

## Task 1: Link "ranked by community upvotes" → Hugging Face Papers

**Files:**
- Modify: `components/FeedTabs.tsx`
- Test: `tests/components/FeedTabs.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/components/FeedTabs.test.tsx`:

```tsx
import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeedTabs } from "@/components/FeedTabs";

test("the Trending hint links to the Hugging Face papers page", () => {
  render(<FeedTabs active="trending" />);
  const link = screen.getByRole("link", { name: /ranked by community upvotes/i });
  expect(link).toHaveAttribute("href", "https://huggingface.co/papers");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noreferrer");
});

test("non-trending hints are plain text, not links", () => {
  render(<FeedTabs active="latest" />);
  const hint = screen.getByText("freshest arXiv submissions");
  expect(hint.closest("a")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/FeedTabs.test.tsx`
Expected: FAIL — first test errors because the hint is a `<span>`, not a `link` role.

- [ ] **Step 3: Implement the change**

Replace the `HINTS` constant and the trailing hint markup in `components/FeedTabs.tsx`.

Change the constant (lines 10-14) to:

```tsx
const HINTS: Record<FeedTab, { text: string; href?: string }> = {
  latest: { text: "freshest arXiv submissions" },
  trending: { text: "ranked by community upvotes", href: "https://huggingface.co/papers" },
  famous: { text: "ranked by citations" },
};
```

In the component, compute the hint and render an anchor when it has an href. Replace the trailing `<span>` (lines 36-38) — and add the `hint`/`hintClass` locals just inside the function body before `return`:

```tsx
export function FeedTabs({ active }: { active: FeedTab }) {
  const hint = HINTS[active];
  const hintClass = "ml-auto hidden font-mono text-[11px] text-faint min-[540px]:inline";
  return (
    <nav className="flex items-baseline gap-6 border-b border-line">
      {FEED_TABS.map((tab) => {
        const isActive = tab === active;
        return (
          <Link
            key={tab}
            href={tab === "latest" ? "/" : `/?tab=${tab}`}
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px border-b-2 px-px pb-[11px] pt-2 text-[14.5px] tracking-wide transition-colors ${
              isActive
                ? "border-accent font-semibold text-ink"
                : "border-transparent font-normal text-muted-foreground hover:text-ink"
            }`}
          >
            {LABELS[tab]}
          </Link>
        );
      })}
      {hint.href ? (
        <a
          href={hint.href}
          target="_blank"
          rel="noreferrer"
          className={`${hintClass} transition-colors hover:text-muted-foreground hover:underline`}
        >
          {hint.text}
        </a>
      ) : (
        <span className={hintClass}>{hint.text}</span>
      )}
    </nav>
  );
}
```

(Use a plain `<a>`, not `next/link` — this is an external URL.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/components/FeedTabs.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/FeedTabs.tsx tests/components/FeedTabs.test.tsx
git commit -m "feat(feed): link the Trending 'community upvotes' hint to huggingface.co/papers"
```

---

## Task 2: Make the read rail fully reversible

**Files:**
- Modify: `components/HtmlReader.tsx`
- Modify: `lib/reader/readDepth.ts` (comments only)
- Modify: `docs/superpowers/specs/2026-06-12-scroll-depth-read-rail-design.md` (note)
- Test: `tests/components/HtmlReader.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `tests/components/HtmlReader.test.tsx`. First add `fireEvent` to the import and a geometry helper near the top (after the existing `beforeEach`):

```tsx
import { render, screen, fireEvent } from "@testing-library/react";

function setGeometry(scrollY: number, innerHeight: number, scrollHeight: number) {
  Object.defineProperty(window, "scrollY", { value: scrollY, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: innerHeight, configurable: true });
  Object.defineProperty(document.documentElement, "scrollHeight", {
    value: scrollHeight,
    configurable: true,
  });
}
```

Then add the test:

```tsx
test("the read rail follows current scroll depth and shrinks on scroll up", () => {
  const { container } = renderReader(null);
  const rail = () => container.querySelector<HTMLElement>('[data-testid="read-rail"]')!;

  // Doc 1000px, viewport 200px. scrollY=300 => (300+200)/1000 = 0.5.
  setGeometry(300, 200, 1000);
  fireEvent.scroll(window);
  expect(rail().style.height).toBe("50%");

  // Scroll back up: scrollY=50 => (50+200)/1000 = 0.25. A monotonic rail would
  // stay at 50%; the reversible rail drops to 25%.
  setGeometry(50, 200, 1000);
  fireEvent.scroll(window);
  expect(rail().style.height).toBe("25%");
});
```

(Depths 0.5 and 0.25 are chosen because `0.5*100` and `0.25*100` are exact in floating point, so the `style.height` string is clean.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/components/HtmlReader.test.tsx`
Expected: FAIL — the second assertion gets `"50%"` (monotonic max never decreases) instead of `"25%"`.

- [ ] **Step 3: Implement the change**

In `components/HtmlReader.tsx`, the scroll handler (lines 91-104) currently only bumps the value when it grows. Replace the `onScroll` body so it tracks the current fraction unconditionally:

```tsx
  // Track the current read depth (reversible) + debounce persistence.
  useEffect(() => {
    function onScroll() {
      const frac = readDepthFraction(
        window.scrollY,
        window.innerHeight,
        document.documentElement.scrollHeight,
      );
      readPctRef.current = frac;
      setReadPct(frac);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persist(), 600);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [persist]);
```

Update the two now-inaccurate comments in the same file:
- Line 24: change `// Read depth = deepest scroll fraction reached. Monotonic: it only grows.` to `// Read depth = current scroll fraction (viewport bottom). Reversible: scrolling up lowers it.`
- Line 117: change `{/* Read rail: amber bar in the left gutter, filled to the deepest scroll. */}` to `{/* Read rail: amber bar in the left gutter, filled to the current read depth. */}`

(`persist()` is unchanged: it still sends `readPct: readPctRef.current` and `status: isComplete(depth) ? "done" : "reading"`, so a lower depth now correctly persists `"reading"`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/components/HtmlReader.test.tsx`
Expected: PASS (new test plus the four existing ones — seeding the rail from saved `readPct`, empty rail when unread, etc. are unaffected).

- [ ] **Step 5: Correct the read-depth helper docs**

In `lib/reader/readDepth.ts`, rewrite the file header (lines 1-7) and the `DONE_THRESHOLD` comment so they describe the reversible model. Replace lines 1-10 with:

```ts
/**
 * Read-depth math, independent of the DOM so it can be unit tested.
 *
 * Read depth is the current viewport BOTTOM as a fraction (0–1) of the document
 * height. The reader tracks this live value (it rises and falls with scrolling)
 * to drive the left-margin "read" rail, so scrolling back up lowers the rail.
 */

/** At/above this fraction the paper counts as finished (status -> done). */
export const DONE_THRESHOLD = 0.98;
```

(The `readDepthFraction` and `isComplete` function bodies are unchanged — they already compute the current fraction; only the prose was wrong.)

- [ ] **Step 6: Supersede the monotonic decision in the old spec**

In `docs/superpowers/specs/2026-06-12-scroll-depth-read-rail-design.md`, under the `### Accepted trade-off` heading (around line 33), insert this line directly under the heading, above the existing paragraph:

```markdown
> **Superseded 2026-06-14:** the read rail is now fully reversible — scrolling up
> lowers the rail and can return a finished paper to `reading`. See
> `2026-06-14-reader-and-sources-improvements-design.md` §2. The monotonic
> "no un-mark" behavior described below no longer applies.
```

- [ ] **Step 7: Run the full reader test group + typecheck**

Run: `pnpm vitest run tests/components/HtmlReader.test.tsx tests/reader/readDepth.test.ts && pnpm typecheck`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add components/HtmlReader.tsx lib/reader/readDepth.ts tests/components/HtmlReader.test.tsx docs/superpowers/specs/2026-06-12-scroll-depth-read-rail-design.md
git commit -m "feat(reader): make the read rail fully reversible (scroll-up un-marks)"
```

---

## Task 3: Add the `venue` field to the data model

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Add optional `venue` to the types**

In `lib/types.ts`:

Add `"conferences"` to the `SourceId` union (lines 1-6):

```ts
export type SourceId =
  | "arxiv"
  | "huggingface"
  | "paperswithcode"
  | "semanticscholar"
  | "googlescholar"
  | "conferences";
```

Add an optional `venue` to `NormalizedPaper` (after `publishedAt`, around line 20):

```ts
  /** ISO 8601 string. */
  publishedAt: string | null;
  /** Short conference label, e.g. "NeurIPS 2024". Set only by the conferences source. */
  venue?: string | null;
  signals: PaperSignals;
```

Add an optional `venue` to `PaperRow` (after `published_at`, around line 42):

```ts
  published_at: string | null;
  venue?: string | null;
  hf_upvotes: number;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors (optional fields don't break the four existing parsers or any fixture).

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat(types): add optional venue to NormalizedPaper and PaperRow"
```

---

## Task 4: Carry `venue` through dedup

**Files:**
- Modify: `lib/corpus/dedupe.ts`
- Test: `tests/corpus/dedupe.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/corpus/dedupe.test.ts`:

```ts
test("an arxiv row inherits a conference venue when merged", () => {
  const merged = dedupe([
    base({ arxivId: "2401.9" }),
    base({ arxivId: "2401.9", venue: "NeurIPS 2024" }),
  ]);
  expect(merged).toHaveLength(1);
  expect(merged[0].venue).toBe("NeurIPS 2024");
});

test("venue survives regardless of merge order", () => {
  const merged = dedupe([
    base({ arxivId: "2401.10", venue: "ICML 2025" }),
    base({ arxivId: "2401.10" }),
  ]);
  expect(merged[0].venue).toBe("ICML 2025");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/corpus/dedupe.test.ts`
Expected: FAIL — "an arxiv row inherits a conference venue" gets `undefined` (the merge branch never copies `venue`).

- [ ] **Step 3: Implement the change**

In `lib/corpus/dedupe.ts`, the merge branch (lines 29-44) builds the merged object. Add a `venue` line alongside the other coalesced fields:

```ts
    map.set(key, {
      ...cur,
      arxivId: cur.arxivId ?? p.arxivId,
      doi: cur.doi ?? p.doi,
      abstract: cur.abstract ?? p.abstract,
      htmlUrl: cur.htmlUrl ?? p.htmlUrl,
      pdfUrl: cur.pdfUrl ?? p.pdfUrl,
      sourceUrl: cur.sourceUrl ?? p.sourceUrl,
      publishedAt: cur.publishedAt ?? p.publishedAt,
      venue: cur.venue ?? p.venue,
      categories: Array.from(new Set([...cur.categories, ...p.categories])),
      signals: {
        hfUpvotes: maxSignal(cur.signals.hfUpvotes, p.signals.hfUpvotes),
        pwcStars: maxSignal(cur.signals.pwcStars, p.signals.pwcStars),
        citations: maxSignal(cur.signals.citations, p.signals.citations),
      },
    });
```

(The first-insert branch at line 26 spreads `...p`, so it already preserves `venue`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/corpus/dedupe.test.ts`
Expected: PASS (all, including the 5 existing cases).

- [ ] **Step 5: Commit**

```bash
git add lib/corpus/dedupe.ts tests/corpus/dedupe.test.ts
git commit -m "feat(corpus): preserve venue when deduping papers across sources"
```

---

## Task 5: The conferences source adapter

**Files:**
- Create: `lib/sources/conferences.ts`
- Test: `tests/sources/conferences.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/sources/conferences.test.ts`:

```ts
import { test, expect } from "vitest";
import { labelConference } from "@/lib/sources/conferences";
import type { NormalizedPaper } from "@/lib/types";

const paper = (publishedAt: string | null): NormalizedPaper => ({
  arxivId: "2401.1",
  doi: null,
  title: "T",
  authors: [],
  abstract: null,
  categories: [],
  htmlUrl: null,
  pdfUrl: null,
  sourceUrl: null,
  publishedAt,
  signals: { citations: 5 },
});

test("stamps a short venue label with the publication year", () => {
  const [p] = labelConference([paper("2024-01-01T00:00:00Z")], "NeurIPS");
  expect(p.venue).toBe("NeurIPS 2024");
});

test("falls back to the bare label when the year is unknown", () => {
  const [p] = labelConference([paper(null)], "ICLR");
  expect(p.venue).toBe("ICLR");
});

test("leaves the other fields intact", () => {
  const [p] = labelConference([paper("2025-01-01T00:00:00Z")], "ICML");
  expect(p.arxivId).toBe("2401.1");
  expect(p.signals.citations).toBe(5);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/sources/conferences.test.ts`
Expected: FAIL — cannot import `labelConference` (module does not exist).

- [ ] **Step 3: Implement the adapter**

Create `lib/sources/conferences.ts`:

```ts
import { env } from "@/lib/env";
import type { NormalizedPaper } from "@/lib/types";
import { parseS2 } from "./semanticscholar";

interface ConferenceVenue {
  /** Short badge label. */
  label: string;
  /** Semantic Scholar canonical venue name used for the `venue` filter. */
  s2Venue: string;
}

const VENUES: ConferenceVenue[] = [
  { label: "NeurIPS", s2Venue: "Neural Information Processing Systems" },
  { label: "ICML", s2Venue: "International Conference on Machine Learning" },
  { label: "ICLR", s2Venue: "International Conference on Learning Representations" },
];

const FIELDS = "title,abstract,year,citationCount,authors,externalIds,openAccessPdf";

/** Stamp a short venue label ("NeurIPS 2024") onto parsed papers. Pure + testable. */
export function labelConference(papers: NormalizedPaper[], label: string): NormalizedPaper[] {
  return papers.map((p) => {
    const year = p.publishedAt ? p.publishedAt.slice(0, 4) : null;
    return { ...p, venue: year ? `${label} ${year}` : label };
  });
}

/** The last two calendar years, e.g. "2025-2026" — bounds conference volume. */
function recentYears(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  return `${y - 1}-${y}`;
}

/**
 * Pull recent papers from top ML conferences (NeurIPS / ICML / ICLR) via Semantic
 * Scholar's venue filter. No API key required (rate-limited; a 429 skips that venue).
 * Each paper is stamped with a short venue badge label.
 */
export async function fetchConferences(years: string = recentYears()): Promise<NormalizedPaper[]> {
  const key = env().SEMANTIC_SCHOLAR_API_KEY;
  const headers: Record<string, string> = { "User-Agent": "PaperDeck/1.0 (research reader)" };
  if (key) headers["x-api-key"] = key;

  const all: NormalizedPaper[] = [];
  for (const v of VENUES) {
    const url =
      `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(v.label)}` +
      `&venue=${encodeURIComponent(v.s2Venue)}&year=${years}&limit=50&fields=${FIELDS}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      if (res.status === 429) continue; // expected without a key — skip this venue
      throw new Error(`conferences ${res.status}`);
    }
    all.push(...labelConference(parseS2(await res.json()), v.label));
  }
  return all;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/sources/conferences.test.ts`
Expected: PASS (all three).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/sources/conferences.ts tests/sources/conferences.test.ts
git commit -m "feat(sources): conference adapter (NeurIPS/ICLR/ICML via Semantic Scholar venue filter)"
```

> Note: `fetchConferences` is a thin fetch wrapper (not unit-tested, matching `fetchArxivLatest`/`fetchHfDaily`). The exact `venue`/`year` query params may need tuning against the live Semantic Scholar API during manual verification (Task 8); a venue returning nothing is non-fatal.

---

## Task 6: Map `venue` into the upserted row + register the source

**Files:**
- Modify: `lib/corpus/upsert.ts`
- Modify: `lib/sources/index.ts`
- Test: `tests/corpus/upsert.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/corpus/upsert.test.ts` (covers only the pure `toPaperRow` mapping — no DB):

```ts
import { test, expect } from "vitest";
import { toPaperRow } from "@/lib/corpus/upsert";
import type { NormalizedPaper } from "@/lib/types";

const base = (o: Partial<NormalizedPaper>): NormalizedPaper => ({
  arxivId: "2401.1",
  doi: null,
  title: "T",
  authors: [],
  abstract: null,
  categories: [],
  htmlUrl: null,
  pdfUrl: null,
  sourceUrl: null,
  publishedAt: null,
  signals: {},
  ...o,
});

test("maps a venue when present", () => {
  expect(toPaperRow(base({ venue: "NeurIPS 2024" })).venue).toBe("NeurIPS 2024");
});

test("maps a missing venue to null", () => {
  expect(toPaperRow(base({})).venue).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/corpus/upsert.test.ts`
Expected: FAIL — `toPaperRow(...).venue` is `undefined` (the row object has no `venue` key).

- [ ] **Step 3: Implement the mapping**

In `lib/corpus/upsert.ts`, add a `venue` line to the returned row object in `toPaperRow` (after `published_at`, around line 17):

```ts
    source_url: p.sourceUrl,
    published_at: p.publishedAt,
    venue: p.venue ?? null,
    hf_upvotes: p.signals.hfUpvotes ?? 0,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/corpus/upsert.test.ts`
Expected: PASS.

- [ ] **Step 5: Register the conferences source**

In `lib/sources/index.ts`, import the adapter (after line 7) and add a registry entry.

Add the import:

```ts
import { fetchScholar } from "./googlescholar";
import { fetchConferences } from "./conferences";
```

Add the registry entry to the array returned by `sources()` (after the `semanticscholar` entry, line 31):

```ts
    { id: "semanticscholar", enabled: true, run: () => fetchS2Famous() },
    { id: "conferences", enabled: true, run: () => fetchConferences() },
    { id: "googlescholar", enabled: Boolean(e.SERPAPI_KEY), run: () => fetchScholar() },
```

- [ ] **Step 6: Typecheck + run the corpus/sources test groups**

Run: `pnpm vitest run tests/corpus tests/sources && pnpm typecheck`
Expected: PASS, no type errors (existing `registry.test.ts` is unaffected — it uses inline fake sources).

- [ ] **Step 7: Commit**

```bash
git add lib/corpus/upsert.ts lib/sources/index.ts tests/corpus/upsert.test.ts
git commit -m "feat(corpus): persist venue and register the conferences source"
```

---

## Task 7: Database migration + venue badge on the card

**Files:**
- Create: `supabase/migrations/0005_papers_venue.sql`
- Modify: `components/PaperCard.tsx`
- Test: `tests/components/PaperCard.test.tsx`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/0005_papers_venue.sql`:

```sql
-- Add a conference venue label (e.g. "NeurIPS 2024") to the shared corpus.
-- Nullable and additive: populated by the conferences source and merged onto
-- matching arXiv rows; existing rows stay NULL and backfill as the cron re-ingests.
alter table papers add column if not exists venue text;
```

- [ ] **Step 2: Write the failing card tests**

Add to `tests/components/PaperCard.test.tsx`:

```tsx
test("renders a venue badge when the paper has a venue", () => {
  render(<PaperCard paper={{ ...paper, venue: "NeurIPS 2024" }} starred={false} />);
  expect(screen.getByText("NeurIPS 2024")).toBeInTheDocument();
});

test("omits the venue badge when there is no venue", () => {
  render(<PaperCard paper={paper} starred={false} />);
  expect(screen.queryByText(/NeurIPS|ICML|ICLR/)).toBeNull();
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run tests/components/PaperCard.test.tsx`
Expected: FAIL — "renders a venue badge" cannot find the text (no badge yet).

- [ ] **Step 4: Implement the badge**

In `components/PaperCard.tsx`, add the badge in the top meta row, right after the category `<span>` (lines 25-29). The row becomes:

```tsx
      <div className="flex items-baseline gap-3 font-mono text-[11.5px] tracking-wide">
        <span className="text-accent">{paper.categories.slice(0, 2).join(" · ") || "paper"}</span>
        {paper.venue && (
          <span className="rounded-sm bg-tint px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-accent">
            {paper.venue}
          </span>
        )}
        {date && <span className="text-faint">{date}</span>}
        <span className="ml-auto whitespace-nowrap text-faint">{signalLine(paper)}</span>
      </div>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run tests/components/PaperCard.test.tsx`
Expected: PASS (all, including the 7 existing cases).

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0005_papers_venue.sql components/PaperCard.tsx tests/components/PaperCard.test.tsx
git commit -m "feat(corpus): venue column + conference badge on the paper card"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run the entire test suite**

Run: `pnpm test`
Expected: all tests PASS.

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 3: Apply the migration to Supabase**

The `0005_papers_venue.sql` migration must be applied to the live project before the conferences source can write `venue` (the cron upsert will otherwise fail on the unknown column). Apply it via the Supabase CLI (`supabase db push`) or the Supabase MCP `apply_migration` tool. This is additive and safe (nullable column, `if not exists`).

- [ ] **Step 4: Manual smoke test (optional but recommended)**

Run `pnpm dev --webpack` (per the project's Turbopack caveat), then:
- **Feed:** the Trending tab hint "ranked by community upvotes" is a link to `https://huggingface.co/papers`.
- **Reader:** open an HTML paper, scroll down (rail fills), scroll back up (rail shrinks); scrolling above the end returns status to reading.
- **Conferences:** trigger a refresh (owner "Refresh" button or `GET /api/cron/refresh` with `CRON_SECRET`); confirm some cards show a `NeurIPS/ICML/ICLR <year>` badge. If a venue returns nothing, tune the `venue`/`year` params in `lib/sources/conferences.ts` against the live Semantic Scholar API.

---

## Self-Review

**Spec coverage:**
- §1 upvotes link → Task 1. ✓
- §2 reversible rail (logic, helper docs, old-spec supersede, tests) → Task 2. ✓
- §3 conferences: `venue` type → Task 3; dedup merge → Task 4; adapter + label stamping → Task 5; `toPaperRow` map + source registration → Task 6; migration + card badge → Task 7. ✓
- §3 testing items (parse/label fixture, dedupe venue, toPaperRow, card badge) → Tasks 4–7. ✓

**Deviation from spec (intentional, simpler):** the spec said `parseS2` would capture venue; instead `labelConference` stamps the short label from the query, leaving `parseS2` untouched (more robust — no dependency on S2's raw venue string). Outcome is identical: conference papers carry a `venue` badge.

**Type consistency:** `venue` is `string | null` (optional) on `NormalizedPaper` and `PaperRow`; `labelConference(papers, label)` returns `NormalizedPaper[]`; `toPaperRow` writes `venue: p.venue ?? null`; dedupe merges `cur.venue ?? p.venue`; `SourceId` includes `"conferences"` and the registry entry uses that exact id. Consistent across tasks.

**Placeholder scan:** none — every step has concrete code and an exact command.
