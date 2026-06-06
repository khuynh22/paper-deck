# PaperDeck — Design Spec

**Date:** 2026-06-06
**Status:** Approved (brainstorming complete)

## 1. Purpose

A responsive, multi-user web app that supports an AI/ML research reading habit. Users browse a continuously-refreshed feed of AI/ML papers (Latest / Trending / Famous), star papers to read, and read them in-app with a reader that remembers where they left off — including a "I finished here" marker that highlights everything already read.

## 2. Goals & Non-Goals

**Goals**
- Responsive UI that works well on phone and PC.
- Aggregate papers from arXiv, Hugging Face Daily Papers, Papers With Code, Semantic Scholar (and Google Scholar, owner-only/flagged).
- One deduplicated corpus; "Latest / Trending / Famous" are views over it.
- Star/unstar papers; a personal library.
- In-app reader (HTML + PDF paths) with scroll-resume and a "read up to here" highlight marker.
- Sync stars + reading progress across devices via a cloud DB and login.

**Non-Goals (YAGNI)**
- Social features (comments, following, sharing).
- Full-text search across all of arXiv (feed + corpus search is enough).
- Annotations/notes beyond the read-progress marker (can be a later phase).
- Mobile native apps (responsive web only).

## 3. Architecture

**Stack:** Next.js (App Router, TypeScript) · Tailwind CSS + shadcn/ui · Supabase (Postgres + Auth + Row-Level Security) · deployed on Vercel. Free-tier to start.

**One corpus, many views.** The same paper appears across sources and they nearly all share the **arXiv ID** as a common key. Per-source adapters normalize into a single `papers` table that accumulates *signals* (HF upvotes, PwC GitHub stars, citation count, recency). Feed tabs are sort/filter views:
- **Latest** → order by `published_at desc`
- **Trending** → score from HF upvotes + PwC stars + recency
- **Famous** → order by `citations desc`

**Code layout**
```
lib/sources/        one adapter per source -> normalized Paper[]
  arxiv.ts          (latest, by category)              [MVP source]
  huggingface.ts    (daily papers + upvotes)
  paperswithcode.ts (trending + github stars)
  semanticscholar.ts(citations -> "famous")
  googlescholar.ts  (feature-flagged, owner-only)
lib/corpus/         normalize.ts (common Paper type) + dedupe.ts + upsert.ts
lib/reader/         fetchHtml.ts · sanitize.ts (MathML-safe) · pdfProxy.ts · anchor.ts
lib/db/             typed Supabase client + queries
app/api/            route handlers: /feed, /reader/[id], /cron/refresh, /star
app/(ui)/           feed, paper/[id], reader/[id], library, (home: continue-reading)
components/         PaperCard, FeedTabs, ReaderView, ProgressBar, MarkButton, AuthButton...
```

## 4. Data Model (Supabase Postgres)

| Table | Columns (key) | Access |
|---|---|---|
| `papers` | id (uuid), arxiv_id, doi, title, authors (text[]), abstract, categories (text[]), html_url, pdf_url, source_url, published_at, hf_upvotes, pwc_stars, citations, fetched_at, updated_at | public read; service-role write |
| `paper_content` | paper_id (fk), kind ('html'\|'pdf-meta'), sanitized_html, page_count, fetched_at | public read; service-role write |
| `stars` | user_id (fk auth.users), paper_id (fk), created_at | **RLS: owner only** |
| `reading_progress` | user_id, paper_id, scroll_pct (real), block_anchor (text), marked_anchor (text), reader_kind ('html'\|'pdf'), status ('to_read'\|'reading'\|'done'), updated_at | **RLS: owner only** |

- Unique key on `papers.arxiv_id` (nullable) and a fallback unique on normalized (doi) / hashed title for non-arXiv items. Dedup on upsert.
- `stars` and `reading_progress` PK = (user_id, paper_id).
- RLS policies: `auth.uid() = user_id` for select/insert/update/delete on the two per-user tables. `papers`/`paper_content` are world-readable; writes only via service role (cron + reader cache).

## 5. The Reader & Resume (crux feature)

Two render paths, one progress model.

**HTML path** (recent papers with arXiv HTML):
1. Server fetches arXiv HTML (`arxiv.org/html/{id}`), falls back to ar5iv.
2. Sanitize with DOMPurify **configured to allow MathML** (so equations survive) and **rewrite relative image `src` to absolute `arxiv.org` URLs**.
3. Cache the sanitized HTML in `paper_content` (fetch+sanitize once, not per open; arXiv politeness).
4. Client renders it in our own container; each block element is tagged `data-blk="0..N"` in DOM order.

**PDF path** (old/famous PDF-only papers): pdf.js renders pages in-app; progress is page-level. The PDF is proxied through our API (avoids CORS) and may be cached.

**Resume logic (robust by design):**
- Continuously (debounced) persist **scroll-% as the floor** (always recovers, survives re-render) AND the **block/page anchor** as the precise spot.
- On reopen: scroll to anchor if still valid, else fall back to scroll-%.
- **"I finished here":** floating button (or tap a line) sets `marked_anchor`; everything up to it gets a "read" highlight (background tint + left border). HTML = block-level; PDF = page-level.
- **No mark:** simply restore last scroll position. (Matches the spec: mark → highlight up to point; no mark → scroll resume.)
- **Continue reading shelf** on home lists `status = 'reading'` papers, most-recent first.

## 6. Sources, Freshness, Errors

**Freshness:** a scheduled job upserts Latest + Trending into the corpus.
- **VERIFY:** Vercel Hobby cron cadence. If capped to daily and we want hourly, fall back to **Supabase pg_cron** or **GitHub Actions** cron. (Resolve during implementation.)
- Plus an on-demand "Refresh" button (rate-limited) that triggers the same path.

**Per-source notes**
- **arXiv** — Atom API, no key. MVP source.
- **Hugging Face** — Daily Papers (upvotes). No key.
- **Papers With Code** — **VERIFY API is still live/free** before relying on it; if dead, degrade to "off."
- **Semantic Scholar** — free **API key** needed for real volume; recommend Graph API for citations.
- **Google Scholar** — no official API; **feature-flagged, owner-only, disabled by default** (SerpAPI bills per search; abuse-exposed under public signup).

**Error handling:** sources fail independently — a dead source never blocks the feed; show cached corpus + a quiet "couldn't refresh X" note. Reader HTML missing → PDF path; PDF missing → "open on arXiv" + status only.

## 7. Auth & Multi-user

- Supabase Auth: **Google OAuth + email magic link**.
- Only multi-user "tax" is RLS on `stars` + `reading_progress`; corpus + reader are shared and built once.
- Google Scholar gated to an owner allow-list (env `OWNER_EMAILS`).

## 8. Testing

- Unit: each source adapter (mocked HTTP), normalize/dedupe, sanitize (MathML kept, scripts stripped, relative URLs rewritten), anchor compute + progress save/restore.
- Component: highlight-up-to-marker logic; FeedTabs sorting.
- Integration: aggregator upsert (dedup across two sources sharing an arXiv ID).

## 9. MVP Vertical Slice (tag for the plan)

Build and prove the only non-standard unit (the reader) on one source first:

**arXiv-only feed → auth → star → reader with scroll-resume + highlight.**

Then layer on, in order: Hugging Face → Papers With Code → Semantic Scholar → Trending/Famous scoring → Google Scholar (flagged) → cron refresh → polish/responsive pass.

## 10. Environment / Secrets (user-provided at deploy)

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `SEMANTIC_SCHOLAR_API_KEY` (optional, recommended)
- `SERPAPI_KEY` (optional; only for Google Scholar)
- `OWNER_EMAILS` (comma-separated; gates Scholar + admin refresh)
- Google OAuth client configured in Supabase Auth.

These require the user's own cloud accounts; the codebase runs locally against Supabase local dev without them.
