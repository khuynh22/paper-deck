# Paper search — design

Date: 2026-06-07
Status: approved (implementing)

## Goal

Let a user search for papers from a search bar in the site header. Search the
local corpus (the same `papers` table the feed reads) with ranked results, and
offer a one-click "search arXiv for more" fallback that ingests fresh matches
into the corpus so they appear in the unified results and work in the reader.

## Decisions (from brainstorming)

- **Scope:** corpus first (instant), with an explicit arXiv fallback to discover
  papers not yet ingested. "What's on the feed" == the corpus, so corpus search
  already covers it.
- **Entry point:** a search bar in the site header on every page; submitting
  routes to a dedicated `/search?q=…` page.
- **Matching:** Postgres full-text search (a generated `tsvector` column + GIN
  index), **ranked** via `ts_rank`. Chosen over `ilike` because ranked results
  are the whole point of a search box.

## Ranking must go through an RPC, not `.textSearch()`

supabase-js `.textSearch('search_vector', q, {type:'websearch'})` compiles to a
`@@` filter in the WHERE clause and returns matches in **unspecified order**.
`.order()` only takes a column name, not a `ts_rank(...)` expression, so there is
no way to rank via the query builder. The fix is a `stable` SQL function called
with `.rpc()` — the same "rank outside the simple query builder" shape the
`trending` tab already uses (it re-sorts in JS). This is bundled into the same
migration as the column.

## Migration — `supabase/migrations/0002_search.sql`

```sql
alter table papers add column if not exists search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', array_to_string(authors, ' ')), 'B') ||
    setweight(to_tsvector('english', coalesce(abstract, '')), 'C') ||
    setweight(to_tsvector('english', array_to_string(categories, ' ')), 'D')
  ) stored;

create index if not exists papers_search_idx on papers using gin (search_vector);

create or replace function search_papers(q text, lim int default 40)
returns setof papers
language sql
stable
as $$
  select *
  from papers
  where search_vector @@ websearch_to_tsquery('english', q)
  order by ts_rank(search_vector, websearch_to_tsquery('english', q)) desc,
           published_at desc nulls last
  limit lim;
$$;
```

- `generated … stored` means **no app code maintains the column** — Postgres
  recomputes it on every insert/update, so `upsertPapers` is untouched and
  existing rows index the moment the migration runs.
- Weights: title (A) > authors (B) > abstract (C) > categories (D).
- The two-arg `to_tsvector('english', …)` is immutable, so it is legal in a
  generated column. Verify on apply: it must not raise "generation expression is
  not immutable". Fallback (do not pre-build): trigger-maintained column.
- `search_papers` is `security invoker` (default), so the caller's RLS applies.
  `papers` is world-readable (`select using(true)`), so anon + authenticated can
  call it.

## Components & data flow

- **`components/SearchBar.tsx`** (server-safe, no `use client`): a plain
  `<form action="/search" method="get">` with `<input name="q">`. GET navigation
  needs no JS. Props: `defaultValue` (prefill on the results page), `className`
  (the header hides it below `sm`; the results page renders a full-width one).
- **`components/SiteHeader.tsx`**: render `<SearchBar>` in the header.
- **`app/search/page.tsx`** (server, `force-dynamic`): read `q` from the awaited
  `searchParams` (this Next version makes it a Promise — matches the feed page).
  If `q` is non-empty, call `searchCorpus(q)` and render the ranked results as
  the existing `PaperCard` grid with the same starred-marker logic as the feed.
  Always render the `ExternalSearch` button when `q` is present.
- **`lib/corpus/query.ts` → `searchCorpus(q, limit=40)`**: `db.rpc('search_papers',
  { q, lim })`. Empty/whitespace `q` returns `[]` without a round-trip.
- **`lib/sources/arxiv.ts` → `buildArxivSearchUrl(q, max=25)` (pure) +
  `searchArxiv(q)`**: `search_query=all:<encoded q>&sortBy=relevance`, parsed by
  the existing `parseArxivAtom`.
- **`app/actions/search.ts` → `searchArxivAction(q)`** (`"use server"`): verify a
  signed-in user (the action writes to the shared corpus via the service role, so
  it is gated to signed-in users — not owner-only, since discovery should work for
  any logged-in user, but not anonymous traffic). Then `searchArxiv(q)` →
  `upsertPapers(...)` → `revalidatePath('/search')`. Returns `{ added, error }`.
- **`components/ExternalSearch.tsx`** (`use client`): a button that calls
  `searchArxivAction(q)` inside `useTransition`, shows a status message, and on
  success calls `router.refresh()` so the server page re-renders with the
  now-larger corpus. The freshly ingested arXiv papers then appear in the single
  ranked list — no separate section, no client-side dedup.

## Error handling

- Corpus query failure → the same inline error card the feed already uses.
- arXiv fetch failure → surfaced in the button's status line; corpus results stay
  intact.
- Empty/whitespace `q` → no query is run; the page shows a friendly prompt.

## Testing

- `tests/sources/arxiv-search.test.ts`: `buildArxivSearchUrl` includes the `all:`
  prefix, encodes the query (incl. spaces/special chars), sets `sortBy=relevance`,
  and honors `max_results`.
- `tests/components/SearchBar.test.tsx`: renders a GET form to `/search` with an
  `name="q"` input, and prefills `defaultValue`.
- Following the codebase convention, DB-backed functions (`searchCorpus`) and the
  server action are not unit-tested in isolation (no DB in jsdom) — they are thin
  wrappers over the RPC / `upsertPapers`, both verified by typecheck + build.

## Out of scope (YAGNI)

Typo/fuzzy matching (`pg_trgm`), date/category filter facets, pagination,
autocomplete/typeahead. All easy to add later.
