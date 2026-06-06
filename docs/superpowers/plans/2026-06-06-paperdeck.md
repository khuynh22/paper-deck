# PaperDeck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a responsive, multi-user web app that aggregates AI/ML papers (Latest/Trending/Famous), lets users star papers, and reads them in-app with scroll-resume + a "read up to here" highlight marker, synced across devices.

**Architecture:** Next.js (App Router, TS) renders a responsive UI and hosts API route handlers. Per-source adapters normalize papers into one deduplicated Supabase Postgres corpus; feed tabs are sort/filter views over it. A reader renders arXiv HTML (sanitized, MathML-safe) or PDF (pdf.js) and persists scroll-% + an anchor per user. Supabase Auth + RLS isolate per-user stars/progress.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Supabase (Postgres/Auth/RLS), Vitest + Testing Library, Zod, pdf.js (`react-pdf`), `isomorphic-dompurify`, deployed on Vercel.

---

## File Structure

```
paper-deck/
  app/
    layout.tsx, globals.css, page.tsx           home: Continue-reading + feed entry
    feed/page.tsx                               feed with tabs (Latest/Trending/Famous)
    paper/[id]/page.tsx                         paper detail (abstract, signals, actions)
    reader/[id]/page.tsx                        the reader
    library/page.tsx                            starred papers
    login/page.tsx                              auth
    api/
      cron/refresh/route.ts                     scheduled corpus refresh
      reader/[id]/route.ts                      sanitized HTML / pdf proxy
  components/
    PaperCard.tsx, FeedTabs.tsx, StarButton.tsx, AuthButton.tsx,
    ReaderView.tsx, HtmlReader.tsx, PdfReader.tsx, MarkButton.tsx, ContinueShelf.tsx, ui/*
  lib/
    types.ts                                    Paper, ProgressRow, FeedTab
    sources/{arxiv,huggingface,paperswithcode,semanticscholar,googlescholar}.ts
    corpus/{normalize,dedupe,upsert,query}.ts
    reader/{fetchHtml,sanitize,anchor}.ts
    db/{server,browser,middleware}.ts           Supabase clients
    env.ts                                      validated env
  supabase/migrations/*.sql                     schema + RLS
  tests/**                                      vitest unit/integration
  middleware.ts                                 auth session refresh
```

---

## Phase 0 — Scaffold & tooling

### Task 0.1: Initialize Next.js app

**Files:** whole repo root (package.json, tsconfig, next.config, tailwind, etc.)

- [ ] **Step 1: Scaffold (non-interactive)**

```bash
cd C:/src/paper-deck
npx create-next-app@latest . --ts --app --tailwind --eslint --src-dir=false --import-alias "@/*" --use-pnpm --no-turbopack --yes
```
Expected: app files created alongside existing `docs/` and `.git/`.

- [ ] **Step 2: Add dependencies**

```bash
pnpm add @supabase/supabase-js @supabase/ssr zod isomorphic-dompurify fast-xml-parser react-pdf
pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom msw @types/node
```

- [ ] **Step 3: Configure Vitest** — Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true, setupFiles: ["./tests/setup.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```
Create `tests/setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```
Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"typecheck": "tsc --noEmit"`.

- [ ] **Step 4: Smoke test the harness** — Create `tests/smoke.test.ts`:
```ts
import { test, expect } from "vitest";
test("harness works", () => { expect(1 + 1).toBe(2); });
```
Run: `pnpm test` → Expected: 1 passed.

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "chore: scaffold Next.js app + test harness"
```

### Task 0.2: Validated env module

**Files:** Create `lib/env.ts`, Create `.env.example`, Test `tests/env.test.ts`

- [ ] **Step 1: Write the failing test** — `tests/env.test.ts`:
```ts
import { test, expect } from "vitest";
import { readEnv } from "@/lib/env";
test("reads required public vars", () => {
  const e = readEnv({ NEXT_PUBLIC_SUPABASE_URL: "http://x", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k" });
  expect(e.NEXT_PUBLIC_SUPABASE_URL).toBe("http://x");
});
test("throws when required var missing", () => {
  expect(() => readEnv({})).toThrow();
});
test("owner list parses csv", () => {
  const e = readEnv({ NEXT_PUBLIC_SUPABASE_URL: "u", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k", OWNER_EMAILS: "a@x.com, b@y.com" });
  expect(e.OWNER_EMAILS).toEqual(["a@x.com", "b@y.com"]);
});
```
- [ ] **Step 2: Run → FAIL** (`pnpm test tests/env.test.ts`).
- [ ] **Step 3: Implement `lib/env.ts`:**
```ts
import { z } from "zod";
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SEMANTIC_SCHOLAR_API_KEY: z.string().optional(),
  SERPAPI_KEY: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  OWNER_EMAILS: z.string().optional().transform((s) => s ? s.split(",").map(v => v.trim()).filter(Boolean) : []),
});
export type Env = z.infer<typeof schema>;
export function readEnv(src: Record<string, string | undefined> = process.env): Env {
  return schema.parse(src);
}
export const env = () => readEnv();
```
- [ ] **Step 4: Run → PASS.** Create `.env.example` listing all keys from spec §10.
- [ ] **Step 5: Commit** `git commit -am "feat: validated env module"`.

---

## Phase 1 — Database schema & Supabase clients

### Task 1.1: Schema + RLS migration

**Files:** Create `supabase/migrations/0001_init.sql`

- [ ] **Step 1: Write migration** (full SQL):
```sql
create extension if not exists pgcrypto;

create table papers (
  id uuid primary key default gen_random_uuid(),
  arxiv_id text unique,
  doi text,
  title text not null,
  authors text[] not null default '{}',
  abstract text,
  categories text[] not null default '{}',
  html_url text, pdf_url text, source_url text,
  published_at timestamptz,
  hf_upvotes int not null default 0,
  pwc_stars int not null default 0,
  citations int not null default 0,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index papers_published_idx on papers (published_at desc nulls last);
create index papers_citations_idx on papers (citations desc);

create table paper_content (
  paper_id uuid primary key references papers(id) on delete cascade,
  kind text not null check (kind in ('html','pdf-meta')),
  sanitized_html text,
  page_count int,
  fetched_at timestamptz not null default now()
);

create table stars (
  user_id uuid not null references auth.users(id) on delete cascade,
  paper_id uuid not null references papers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, paper_id)
);

create table reading_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  paper_id uuid not null references papers(id) on delete cascade,
  scroll_pct real not null default 0,
  block_anchor text,
  marked_anchor text,
  reader_kind text check (reader_kind in ('html','pdf')),
  status text not null default 'to_read' check (status in ('to_read','reading','done')),
  updated_at timestamptz not null default now(),
  primary key (user_id, paper_id)
);

alter table papers enable row level security;
alter table paper_content enable row level security;
alter table stars enable row level security;
alter table reading_progress enable row level security;

create policy "papers public read" on papers for select using (true);
create policy "content public read" on paper_content for select using (true);
create policy "stars owner" on stars for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "progress owner" on reading_progress for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```
- [ ] **Step 2: Apply to local Supabase**
```bash
npx supabase init   # if not already
npx supabase start
npx supabase db reset   # applies migrations
```
Expected: tables created, no errors. (If Docker/Supabase unavailable, this is verified later against the user's project; do not block.)
- [ ] **Step 3: Commit** `git add supabase && git commit -m "feat: db schema + RLS"`.

### Task 1.2: Supabase clients (server/browser/middleware)

**Files:** Create `lib/db/server.ts`, `lib/db/browser.ts`, `middleware.ts`, `lib/db/service.ts`

- [ ] **Step 1: Implement clients** (using `@supabase/ssr`):

`lib/db/browser.ts`:
```ts
import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";
export function browserClient() {
  const e = env();
  return createBrowserClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
```
`lib/db/server.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
export async function serverClient() {
  const e = env();
  const store = await cookies();
  return createServerClient(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (all) => { try { all.forEach(({ name, value, options }) => store.set(name, value, options)); } catch {} },
    },
  });
}
```
`lib/db/service.ts` (service-role, server-only, for cron/reader cache writes):
```ts
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
export function serviceClient() {
  const e = env();
  if (!e.SUPABASE_SERVICE_ROLE_KEY) throw new Error("service role key required");
  return createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}
```
`middleware.ts`: standard Supabase SSR session-refresh middleware (copy from Supabase Next.js docs; matcher excludes `_next` and static).
- [ ] **Step 2: Typecheck** `pnpm typecheck` → Expected: no errors.
- [ ] **Step 3: Commit** `git commit -am "feat: supabase clients + middleware"`.

---

## Phase 2 — Core types + arXiv source (MVP corpus)

### Task 2.1: Shared types

**Files:** Create `lib/types.ts`

- [ ] **Step 1: Implement** (the contract every adapter returns):
```ts
export type SourceId = "arxiv" | "huggingface" | "paperswithcode" | "semanticscholar" | "googlescholar";
export interface NormalizedPaper {
  arxivId: string | null;
  doi: string | null;
  title: string;
  authors: string[];
  abstract: string | null;
  categories: string[];
  htmlUrl: string | null;
  pdfUrl: string | null;
  sourceUrl: string | null;
  publishedAt: string | null;        // ISO
  signals: { hfUpvotes?: number; pwcStars?: number; citations?: number };
}
export type FeedTab = "latest" | "trending" | "famous";
export interface ProgressRow {
  scrollPct: number; blockAnchor: string | null; markedAnchor: string | null;
  readerKind: "html" | "pdf" | null; status: "to_read" | "reading" | "done";
}
```
- [ ] **Step 2: Commit** `git commit -am "feat: shared types"`.

### Task 2.2: arXiv adapter

**Files:** Create `lib/sources/arxiv.ts`, Test `tests/sources/arxiv.test.ts`, fixture `tests/fixtures/arxiv.atom.xml`

- [ ] **Step 1: Save a real arXiv Atom response** as `tests/fixtures/arxiv.atom.xml` (one `<entry>` with id `http://arxiv.org/abs/2401.12345v1`, title, summary, author names, `<category term="cs.LG"/>`, published date, a `<link title="pdf">`).
- [ ] **Step 2: Write failing test** — `tests/sources/arxiv.test.ts`:
```ts
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseArxivAtom } from "@/lib/sources/arxiv";
const xml = readFileSync("tests/fixtures/arxiv.atom.xml", "utf8");
test("parses arxiv id without version", () => {
  const [p] = parseArxivAtom(xml);
  expect(p.arxivId).toBe("2401.12345");
});
test("builds html and pdf urls", () => {
  const [p] = parseArxivAtom(xml);
  expect(p.pdfUrl).toContain("arxiv.org/pdf/2401.12345");
  expect(p.htmlUrl).toContain("arxiv.org/html/2401.12345");
});
test("extracts authors + categories", () => {
  const [p] = parseArxivAtom(xml);
  expect(p.authors.length).toBeGreaterThan(0);
  expect(p.categories).toContain("cs.LG");
});
```
- [ ] **Step 3: Run → FAIL.**
- [ ] **Step 4: Implement `lib/sources/arxiv.ts`:**
```ts
import { XMLParser } from "fast-xml-parser";
import type { NormalizedPaper } from "@/lib/types";
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
function arr<T>(x: T | T[] | undefined): T[] { return x == null ? [] : Array.isArray(x) ? x : [x]; }
export function parseArxivAtom(xml: string): NormalizedPaper[] {
  const feed = parser.parse(xml)?.feed;
  return arr(feed?.entry).map((e: any) => {
    const rawId: string = e.id ?? "";
    const arxivId = rawId.split("/abs/")[1]?.replace(/v\d+$/, "") ?? null;
    const authors = arr(e.author).map((a: any) => a.name).filter(Boolean);
    const categories = arr(e.category).map((c: any) => c["@_term"]).filter(Boolean);
    return {
      arxivId, doi: e["arxiv:doi"] ?? null,
      title: String(e.title ?? "").trim().replace(/\s+/g, " "),
      authors, abstract: String(e.summary ?? "").trim() || null, categories,
      htmlUrl: arxivId ? `https://arxiv.org/html/${arxivId}` : null,
      pdfUrl: arxivId ? `https://arxiv.org/pdf/${arxivId}` : null,
      sourceUrl: arxivId ? `https://arxiv.org/abs/${arxivId}` : null,
      publishedAt: e.published ?? null, signals: {},
    };
  });
}
export async function fetchArxivLatest(categories = ["cs.LG","cs.AI","cs.CL","cs.CV"], max = 50): Promise<NormalizedPaper[]> {
  const q = categories.map(c => `cat:${c}`).join("+OR+");
  const url = `http://export.arxiv.org/api/query?search_query=${q}&sortBy=submittedDate&sortOrder=descending&max_results=${max}`;
  const res = await fetch(url, { headers: { "User-Agent": "PaperDeck/1.0" } });
  if (!res.ok) throw new Error(`arxiv ${res.status}`);
  return parseArxivAtom(await res.text());
}
```
- [ ] **Step 5: Run → PASS.**
- [ ] **Step 6: Commit** `git commit -am "feat: arxiv source adapter"`.

### Task 2.3: Corpus normalize/dedupe/upsert

**Files:** Create `lib/corpus/dedupe.ts`, `lib/corpus/upsert.ts`, Test `tests/corpus/dedupe.test.ts`

- [ ] **Step 1: Write failing test** — `tests/corpus/dedupe.test.ts`:
```ts
import { test, expect } from "vitest";
import { dedupe, dedupeKey } from "@/lib/corpus/dedupe";
import type { NormalizedPaper } from "@/lib/types";
const base = (o: Partial<NormalizedPaper>): NormalizedPaper => ({ arxivId:null,doi:null,title:"T",authors:[],abstract:null,categories:[],htmlUrl:null,pdfUrl:null,sourceUrl:null,publishedAt:null,signals:{}, ...o });
test("same arxiv id merges and sums signals", () => {
  const merged = dedupe([
    base({ arxivId:"2401.1", signals:{ hfUpvotes:10 } }),
    base({ arxivId:"2401.1", signals:{ citations:5 } }),
  ]);
  expect(merged).toHaveLength(1);
  expect(merged[0].signals.hfUpvotes).toBe(10);
  expect(merged[0].signals.citations).toBe(5);
});
test("key falls back to doi then normalized title", () => {
  expect(dedupeKey(base({ doi:"10.1/x" }))).toBe("doi:10.1/x");
  expect(dedupeKey(base({ title:"Attention Is All You Need" }))).toBe("title:attention is all you need");
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `lib/corpus/dedupe.ts`:**
```ts
import type { NormalizedPaper } from "@/lib/types";
export function dedupeKey(p: NormalizedPaper): string {
  if (p.arxivId) return `arxiv:${p.arxivId}`;
  if (p.doi) return `doi:${p.doi}`;
  return `title:${p.title.toLowerCase().trim().replace(/\s+/g, " ")}`;
}
export function dedupe(papers: NormalizedPaper[]): NormalizedPaper[] {
  const map = new Map<string, NormalizedPaper>();
  for (const p of papers) {
    const k = dedupeKey(p); const cur = map.get(k);
    if (!cur) { map.set(k, { ...p, signals: { ...p.signals } }); continue; }
    map.set(k, {
      ...cur,
      abstract: cur.abstract ?? p.abstract,
      htmlUrl: cur.htmlUrl ?? p.htmlUrl, pdfUrl: cur.pdfUrl ?? p.pdfUrl,
      doi: cur.doi ?? p.doi, publishedAt: cur.publishedAt ?? p.publishedAt,
      categories: Array.from(new Set([...cur.categories, ...p.categories])),
      signals: {
        hfUpvotes: Math.max(cur.signals.hfUpvotes ?? 0, p.signals.hfUpvotes ?? 0) || undefined,
        pwcStars: Math.max(cur.signals.pwcStars ?? 0, p.signals.pwcStars ?? 0) || undefined,
        citations: Math.max(cur.signals.citations ?? 0, p.signals.citations ?? 0) || undefined,
      },
    });
  }
  return [...map.values()];
}
```
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Implement `lib/corpus/upsert.ts`** (maps NormalizedPaper → row, upserts on `arxiv_id`, writes signals; uses `serviceClient()`):
```ts
import { serviceClient } from "@/lib/db/service";
import { dedupe } from "@/lib/corpus/dedupe";
import type { NormalizedPaper } from "@/lib/types";
export async function upsertPapers(papers: NormalizedPaper[]) {
  const db = serviceClient();
  const rows = dedupe(papers).map((p) => ({
    arxiv_id: p.arxivId, doi: p.doi, title: p.title, authors: p.authors,
    abstract: p.abstract, categories: p.categories, html_url: p.htmlUrl,
    pdf_url: p.pdfUrl, source_url: p.sourceUrl, published_at: p.publishedAt,
    hf_upvotes: p.signals.hfUpvotes ?? 0, pwc_stars: p.signals.pwcStars ?? 0,
    citations: p.signals.citations ?? 0, updated_at: new Date().toISOString(),
  }));
  const { error } = await db.from("papers").upsert(rows, { onConflict: "arxiv_id", ignoreDuplicates: false });
  if (error) throw error;
  return rows.length;
}
```
- [ ] **Step 6: Commit** `git commit -am "feat: corpus dedupe + upsert"`.

### Task 2.4: Corpus query (feed views)

**Files:** Create `lib/corpus/query.ts`, Test `tests/corpus/sort.test.ts`

- [ ] **Step 1: Write failing test for the trending score (pure fn)** — `tests/corpus/sort.test.ts`:
```ts
import { test, expect } from "vitest";
import { trendingScore } from "@/lib/corpus/query";
test("trending rewards upvotes, stars, recency", () => {
  const now = Date.parse("2026-06-06T00:00:00Z");
  const fresh = trendingScore({ hf_upvotes:10, pwc_stars:100, published_at:"2026-06-05T00:00:00Z" }, now);
  const old = trendingScore({ hf_upvotes:10, pwc_stars:100, published_at:"2020-01-01T00:00:00Z" }, now);
  expect(fresh).toBeGreaterThan(old);
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `lib/corpus/query.ts`:**
```ts
import { serverClient } from "@/lib/db/server";
import type { FeedTab } from "@/lib/types";
export function trendingScore(p: { hf_upvotes: number; pwc_stars: number; published_at: string | null }, now: number): number {
  const ageDays = p.published_at ? (now - Date.parse(p.published_at)) / 86_400_000 : 3650;
  const recency = Math.exp(-ageDays / 14); // 2-week half-ish life
  return (p.hf_upvotes * 3 + Math.log1p(p.pwc_stars) * 5) * (0.3 + recency);
}
export async function getFeed(tab: FeedTab, limit = 40) {
  const db = await serverClient();
  let q = db.from("papers").select("*").limit(limit);
  if (tab === "latest") q = q.order("published_at", { ascending: false, nullsFirst: false });
  else if (tab === "famous") q = q.order("citations", { ascending: false });
  else q = q.order("hf_upvotes", { ascending: false }).order("pwc_stars", { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  if (tab === "trending") {
    const now = Date.now();
    return [...(data ?? [])].sort((a, b) => trendingScore(b, now) - trendingScore(a, now));
  }
  return data ?? [];
}
```
- [ ] **Step 4: Run → PASS.** **Step 5: Commit** `git commit -am "feat: corpus feed queries"`.

---

## Phase 3 — Auth + Feed UI + Star (MVP usable app)

### Task 3.1: Auth (login page + AuthButton + callback)

**Files:** Create `app/login/page.tsx`, `app/auth/callback/route.ts`, `components/AuthButton.tsx`, `lib/auth.ts`

- [ ] **Step 1: Implement `lib/auth.ts`** (server helper):
```ts
import { serverClient } from "@/lib/db/server";
export async function currentUser() {
  const db = await serverClient();
  const { data } = await db.auth.getUser();
  return data.user ?? null;
}
```
- [ ] **Step 2: Login page** `app/login/page.tsx` — client component with Google OAuth + magic-link email form using `browserClient().auth.signInWithOAuth({ provider: "google" })` and `signInWithOtp({ email })`. Redirect to `/auth/callback`.
- [ ] **Step 3: Callback** `app/auth/callback/route.ts` — exchanges `code` for a session via `serverClient().auth.exchangeCodeForSession`, redirects to `/`.
- [ ] **Step 4: AuthButton** shows email + Sign out when logged in, else "Sign in" link to `/login`.
- [ ] **Step 5: Manual verify** — `pnpm dev`, visit `/login`, confirm magic-link form renders. (OAuth requires real keys → verified at deploy.)
- [ ] **Step 6: Commit** `git commit -am "feat: auth (oauth + magic link)"`.

### Task 3.2: PaperCard + FeedTabs + feed page

**Files:** Create `components/PaperCard.tsx`, `components/FeedTabs.tsx`, `app/feed/page.tsx`, Test `tests/components/PaperCard.test.tsx`

- [ ] **Step 1: Write failing test** — `tests/components/PaperCard.test.tsx`:
```tsx
import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaperCard } from "@/components/PaperCard";
test("renders title, authors, and a read link", () => {
  render(<PaperCard paper={{ id:"1", title:"Deep Nets", authors:["A","B","C","D"], abstract:"x", categories:["cs.LG"], citations:42, hf_upvotes:0, pwc_stars:0, published_at:"2026-06-01T00:00:00Z", html_url:null, pdf_url:null, source_url:null }} starred={false} />);
  expect(screen.getByText("Deep Nets")).toBeInTheDocument();
  expect(screen.getByText(/A, B, C/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /read/i })).toHaveAttribute("href", "/reader/1");
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `PaperCard.tsx`** — responsive card (Tailwind): title links to `/paper/[id]`, truncated author list (first 3 + "et al."), category chips, signal badges (★ citations, ▲ upvotes), a `StarButton`, and a primary "Read" link to `/reader/[id]`. Mobile: stacked; ≥sm: row with actions right.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Implement `FeedTabs.tsx`** (Latest/Trending/Famous, controls `?tab=` query) and `app/feed/page.tsx` (server component: reads `tab` from searchParams, calls `getFeed`, maps to `PaperCard`, fetches the user's star set to mark cards). Responsive grid: 1 col mobile, 2 col ≥lg.
- [ ] **Step 6: Commit** `git commit -am "feat: feed page + paper cards + tabs"`.

### Task 3.3: Star/unstar (server action)

**Files:** Create `app/actions/star.ts`, `components/StarButton.tsx`, Test `tests/star.test.ts` (unit on the toggle logic)

- [ ] **Step 1: Write failing test for `toggleStarState` pure helper** — `tests/star.test.ts`:
```ts
import { test, expect } from "vitest";
import { nextStarState } from "@/app/actions/star";
test("toggles", () => { expect(nextStarState(true)).toBe(false); expect(nextStarState(false)).toBe(true); });
```
- [ ] **Step 2: Run → FAIL. Step 3: Implement** `app/actions/star.ts`:
```ts
"use server";
import { serverClient } from "@/lib/db/server";
import { currentUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";
export function nextStarState(cur: boolean) { return !cur; }
export async function toggleStar(paperId: string, currentlyStarred: boolean) {
  const user = await currentUser();
  if (!user) throw new Error("auth required");
  const db = await serverClient();
  if (nextStarState(currentlyStarred)) await db.from("stars").upsert({ user_id: user.id, paper_id: paperId });
  else await db.from("stars").delete().eq("user_id", user.id).eq("paper_id", paperId);
  revalidatePath("/feed"); revalidatePath("/library");
}
```
- [ ] **Step 4: Run → PASS.** Implement `StarButton.tsx` (client, optimistic, calls `toggleStar`).
- [ ] **Step 5: Commit** `git commit -am "feat: star/unstar"`.

### Task 3.4: Library page

**Files:** Create `app/library/page.tsx`

- [ ] **Step 1: Implement** — server component: `currentUser()` → query `stars` joined to `papers`, render `PaperCard` grid; empty state with link to `/feed`. Redirect to `/login` if no user.
- [ ] **Step 2: Manual verify** route renders. **Step 3: Commit** `git commit -am "feat: library page"`.

---

## Phase 4 — The Reader (crux)

### Task 4.1: HTML sanitizer (MathML-safe, URL rewrite)

**Files:** Create `lib/reader/sanitize.ts`, Test `tests/reader/sanitize.test.ts`

- [ ] **Step 1: Write failing test** — `tests/reader/sanitize.test.ts`:
```ts
import { test, expect } from "vitest";
import { sanitizePaperHtml } from "@/lib/reader/sanitize";
test("strips scripts", () => {
  expect(sanitizePaperHtml(`<p>ok</p><script>alert(1)</script>`, "2401.1")).not.toContain("script");
});
test("keeps MathML", () => {
  const out = sanitizePaperHtml(`<math><mi>x</mi></math>`, "2401.1");
  expect(out).toContain("<math"); expect(out).toContain("<mi");
});
test("rewrites relative image src to absolute arxiv url", () => {
  const out = sanitizePaperHtml(`<img src="figures/f1.png">`, "2401.12345");
  expect(out).toContain("https://arxiv.org/html/2401.12345/figures/f1.png");
});
test("tags block elements with data-blk indices", () => {
  const out = sanitizePaperHtml(`<p>a</p><p>b</p>`, "2401.1");
  expect(out).toContain('data-blk="0"'); expect(out).toContain('data-blk="1"');
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `lib/reader/sanitize.ts`** using `isomorphic-dompurify`:
```ts
import DOMPurify from "isomorphic-dompurify";
const MATHML = ["math","mrow","mi","mo","mn","msup","msub","msubsup","mfrac","msqrt","mroot","mtable","mtr","mtd","mstyle","mtext","munder","mover","munderover","mspace","semantics","annotation"];
export function sanitizePaperHtml(html: string, arxivId: string): string {
  let out = DOMPurify.sanitize(html, {
    ADD_TAGS: [...MATHML, "figure","figcaption"],
    ADD_ATTR: ["data-blk","mathvariant","displaystyle","scriptlevel"],
    FORBID_TAGS: ["script","style","iframe","form","input"],
    ALLOWED_URI_REGEXP: /^(https?:|data:image\/|#|\/)/i,
  });
  // absolute image URLs
  out = out.replace(/(<img[^>]+src=")(?!https?:|data:)([^"]+)"/gi,
    (_m, p1, src) => `${p1}https://arxiv.org/html/${arxivId}/${src.replace(/^\.?\//, "")}"`);
  // tag block elements in order
  let i = 0;
  out = out.replace(/<(p|h1|h2|h3|h4|li|figure|table|blockquote|div)(\s|>)/gi,
    (_m, tag, tail) => `<${tag} data-blk="${i++}"${tail === ">" ? ">" : " "}`);
  return out;
}
```
> Note: regex block-tagging is acceptable for the cached server transform; if it proves brittle on real papers, swap to a DOM walk (jsdom) in a follow-up — the test contract (`data-blk` indices in order) stays the same.
- [ ] **Step 4: Run → PASS. Step 5: Commit** `git commit -am "feat: mathml-safe html sanitizer"`.

### Task 4.2: HTML fetch + cache

**Files:** Create `lib/reader/fetchHtml.ts`, `app/api/reader/[id]/route.ts`, Test `tests/reader/fetchHtml.test.ts` (msw)

- [ ] **Step 1: Write failing test** mocking arXiv HTML + ar5iv fallback with msw; assert `loadReaderHtml` returns `{ kind:"html", html }` when arXiv 200, and falls to ar5iv when arXiv 404.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `lib/reader/fetchHtml.ts`:**
```ts
import { sanitizePaperHtml } from "@/lib/reader/sanitize";
export async function loadReaderHtml(arxivId: string): Promise<{ kind: "html"; html: string } | { kind: "none" }> {
  for (const url of [`https://arxiv.org/html/${arxivId}`, `https://ar5iv.org/abs/${arxivId}`]) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "PaperDeck/1.0" } });
      if (res.ok) {
        const raw = await res.text();
        if (raw.length > 2000) return { kind: "html", html: sanitizePaperHtml(raw, arxivId) };
      }
    } catch { /* try next */ }
  }
  return { kind: "none" };
}
```
- [ ] **Step 4: Implement `app/api/reader/[id]/route.ts`** — loads paper by id, checks `paper_content` cache; if miss and `arxiv_id` present, `loadReaderHtml`, cache via `serviceClient()`, return `{ kind, html, pdfUrl }`. If html none → return `{ kind:"pdf", pdfUrl }`. PDF bytes proxied via `?pdf=1` (stream `pdf_url` with CORS headers).
- [ ] **Step 5: Run → PASS. Step 6: Commit** `git commit -am "feat: reader html fetch + cache + api"`.

### Task 4.3: Anchor + progress logic (pure)

**Files:** Create `lib/reader/anchor.ts`, Test `tests/reader/anchor.test.ts`

- [ ] **Step 1: Write failing test** — `tests/reader/anchor.test.ts`:
```ts
import { test, expect } from "vitest";
import { resolveResumeTarget, blocksUpTo } from "@/lib/reader/anchor";
test("prefers valid anchor over scroll pct", () => {
  expect(resolveResumeTarget({ blockAnchor:"12", scrollPct:0.4 }, ["0","12","20"])).toEqual({ type:"anchor", value:"12" });
});
test("falls back to scroll pct when anchor missing", () => {
  expect(resolveResumeTarget({ blockAnchor:"99", scrollPct:0.4 }, ["0","12"])).toEqual({ type:"pct", value:0.4 });
});
test("blocksUpTo returns inclusive set of read blocks", () => {
  expect(blocksUpTo("2", ["0","1","2","3"])).toEqual(["0","1","2"]);
});
```
- [ ] **Step 2: Run → FAIL. Step 3: Implement `lib/reader/anchor.ts`:**
```ts
export function resolveResumeTarget(p: { blockAnchor: string | null; scrollPct: number }, validAnchors: string[]) {
  if (p.blockAnchor && validAnchors.includes(p.blockAnchor)) return { type: "anchor" as const, value: p.blockAnchor };
  return { type: "pct" as const, value: p.scrollPct };
}
export function blocksUpTo(marked: string, ordered: string[]): string[] {
  const idx = ordered.indexOf(marked);
  return idx < 0 ? [] : ordered.slice(0, idx);
}
```
- [ ] **Step 4: Run → PASS. Step 5: Commit** `git commit -am "feat: reader anchor/progress logic"`.

### Task 4.4: Progress persistence (server action)

**Files:** Create `app/actions/progress.ts`

- [ ] **Step 1: Implement** `saveProgress(paperId, partial: Partial<ProgressRow>)` — upsert into `reading_progress` for `currentUser()`, set `status='reading'` on first save and `status='done'` when `markedAnchor` is the last block (caller passes a `done` flag). Debounced on the client (Task 4.5). Include `loadProgress(paperId)`.
- [ ] **Step 2: Typecheck → PASS. Step 3: Commit** `git commit -am "feat: progress persistence actions"`.

### Task 4.5: HtmlReader + MarkButton + PdfReader + ReaderView

**Files:** Create `components/HtmlReader.tsx`, `components/PdfReader.tsx`, `components/MarkButton.tsx`, `components/ReaderView.tsx`, `app/reader/[id]/page.tsx`

- [ ] **Step 1: `ReaderView.tsx`** (client) — fetches `/api/reader/[id]`, branches to `HtmlReader` (kind html) or `PdfReader` (kind pdf) or a "open on arXiv" fallback (kind none); loads initial progress.
- [ ] **Step 2: `HtmlReader.tsx`** — renders sanitized HTML via `dangerouslySetInnerHTML` into a scroll container. On mount, resume using `resolveResumeTarget` (scroll to `[data-blk="X"]` or to `scrollPct*scrollHeight`). On scroll (throttled ~500ms) compute topmost visible `data-blk` + `scrollPct`, call debounced `saveProgress`. Apply `read` CSS class to `blocksUpTo(markedAnchor)`.
- [ ] **Step 3: `MarkButton.tsx`** — floating button "I finished here" → sets `markedAnchor` = current topmost visible block, persists, re-applies highlight. A second control "clear mark".
- [ ] **Step 4: `PdfReader.tsx`** — `react-pdf` `<Document>`/`<Page>` over `/api/reader/[id]?pdf=1`; track current page as anchor; "I finished here" marks page; pages ≤ marked get a "read" ribbon; resume to saved page.
- [ ] **Step 5: `globals.css`** — `.read { background: var(--read-tint); border-left: 3px solid var(--read-accent); }` plus reader typography (max-width prose, responsive font-size).
- [ ] **Step 6: `app/reader/[id]/page.tsx`** — server: fetch paper meta, require auth (redirect `/login`), render `<ReaderView paperId title meta />`.
- [ ] **Step 7: Manual verify** with a known HTML-available arXiv id (e.g. a recent cs.LG paper): scroll, reload → resumes; mark → highlight persists across reload.
- [ ] **Step 8: Commit** `git commit -am "feat: reader (html + pdf) with resume + highlight"`.

### Task 4.6: Continue-reading shelf + home

**Files:** Create `components/ContinueShelf.tsx`, modify `app/page.tsx`

- [ ] **Step 1: Implement `ContinueShelf.tsx`** — server: query `reading_progress` where `status='reading'` for user, join papers, order `updated_at desc`, render horizontal scroller of cards each linking to `/reader/[id]` with a small progress bar (`scroll_pct`).
- [ ] **Step 2: `app/page.tsx`** — hero + `ContinueShelf` (if logged in) + buttons to Feed/Library. Logged-out: marketing blurb + Sign in.
- [ ] **Step 3: Commit** `git commit -am "feat: continue-reading shelf + home"`.

---

## Phase 5 — Remaining sources + signals

### Task 5.1: Hugging Face Daily Papers adapter

**Files:** Create `lib/sources/huggingface.ts`, Test `tests/sources/huggingface.test.ts` + fixture

- [ ] **Step 1: Fixture** real HF `/api/daily_papers` JSON (array with `paper.id` = arXiv id, `paper.upvotes`, title, authors).
- [ ] **Step 2: Failing test** `parseHfDaily(json)` → NormalizedPaper[] with `arxivId` set and `signals.hfUpvotes`.
- [ ] **Step 3: Implement** parser + `fetchHfDaily()` hitting `https://huggingface.co/api/daily_papers`. Map `paper.id`→arxivId, upvotes→signal.
- [ ] **Step 4: Run → PASS. Step 5: Commit** `git commit -am "feat: hugging face source"`.

### Task 5.2: Papers With Code adapter (verify-first)

**Files:** Create `lib/sources/paperswithcode.ts`, Test + fixture

- [ ] **Step 1: VERIFY** `https://paperswithcode.com/api/v1/papers/?ordering=-stars` returns 200 JSON. If dead/blocked → implement the adapter to return `[]` and log a warning; mark source disabled in the registry. Record the verification result in the task notes.
- [ ] **Step 2: Failing test** `parsePwc(json)` maps `arxiv_id`, `stars`/repo stars → `signals.pwcStars`.
- [ ] **Step 3: Implement** parser + `fetchPwcTrending()`.
- [ ] **Step 4: Run → PASS. Step 5: Commit** `git commit -am "feat: papers-with-code source"`.

### Task 5.3: Semantic Scholar adapter (citations → famous)

**Files:** Create `lib/sources/semanticscholar.ts`, Test + fixture

- [ ] **Step 1: Fixture** S2 Graph API response (`data[]` with `externalIds.ArXiv`, `citationCount`, title, authors, year).
- [ ] **Step 2: Failing test** `parseS2(json)` → `arxivId` from `externalIds.ArXiv`, `signals.citations` from `citationCount`.
- [ ] **Step 3: Implement** parser + `fetchS2Famous(query)` using `https://api.semanticscholar.org/graph/v1/paper/search?...&fields=title,authors,year,citationCount,externalIds,abstract`; send `x-api-key` header if `SEMANTIC_SCHOLAR_API_KEY` set. Query seeded by ML terms ("machine learning", "transformer", "diffusion", etc.) sorted by citationCount client-side.
- [ ] **Step 4: Run → PASS. Step 5: Commit** `git commit -am "feat: semantic scholar source"`.

### Task 5.4: Google Scholar adapter (flagged, owner-only)

**Files:** Create `lib/sources/googlescholar.ts`, Test + fixture

- [ ] **Step 1: Fixture** SerpAPI `google_scholar` JSON (`organic_results[]` with title, link, publication_info, `inline_links.cited_by.total`).
- [ ] **Step 2: Failing test** `parseSerpScholar(json)` → NormalizedPaper[] with `citations` from cited_by, `arxivId` parsed from link when it's an arXiv URL else null.
- [ ] **Step 3: Implement** parser + `fetchScholar(query)` calling SerpAPI only when `SERPAPI_KEY` set; otherwise return `[]`. Never called unless feature flag + owner.
- [ ] **Step 4: Run → PASS. Step 5: Commit** `git commit -am "feat: google scholar source (flagged)"`.

### Task 5.5: Source registry + aggregator

**Files:** Create `lib/sources/index.ts`, Test `tests/sources/registry.test.ts`

- [ ] **Step 1: Failing test** — registry exposes enabled sources; a throwing source does not abort the others (aggregator catches per-source and returns partial results + errors list).
- [ ] **Step 2: Implement `lib/sources/index.ts`:**
```ts
import { fetchArxivLatest } from "./arxiv";
import { fetchHfDaily } from "./huggingface";
import { fetchPwcTrending } from "./paperswithcode";
import { fetchS2Famous } from "./semanticscholar";
import { fetchScholar } from "./googlescholar";
import { env } from "@/lib/env";
import type { NormalizedPaper } from "@/lib/types";
type Source = { id: string; enabled: boolean; run: () => Promise<NormalizedPaper[]> };
export function sources(): Source[] {
  const e = env();
  return [
    { id: "arxiv", enabled: true, run: () => fetchArxivLatest() },
    { id: "huggingface", enabled: true, run: () => fetchHfDaily() },
    { id: "paperswithcode", enabled: true, run: () => fetchPwcTrending() },
    { id: "semanticscholar", enabled: true, run: () => fetchS2Famous() },
    { id: "googlescholar", enabled: !!e.SERPAPI_KEY, run: () => fetchScholar() },
  ];
}
export async function aggregate() {
  const results: NormalizedPaper[] = []; const errors: { id: string; error: string }[] = [];
  await Promise.all(sources().filter(s => s.enabled).map(async (s) => {
    try { results.push(...await s.run()); }
    catch (err) { errors.push({ id: s.id, error: String(err) }); }
  }));
  return { results, errors };
}
```
- [ ] **Step 3: Run → PASS. Step 4: Commit** `git commit -am "feat: source registry + resilient aggregator"`.

---

## Phase 6 — Refresh job + polish

### Task 6.1: Cron refresh endpoint

**Files:** Create `app/api/cron/refresh/route.ts`, modify `vercel.json`

- [ ] **Step 1: Implement** route: verify `Authorization: Bearer ${CRON_SECRET}` (or Vercel cron header), call `aggregate()`, `upsertPapers(results)`, return `{ upserted, errors }`. Guard against missing service key.
- [ ] **Step 2: `vercel.json`** — `{ "crons": [{ "path": "/api/cron/refresh", "schedule": "0 * * * *" }] }`. **VERIFY** Vercel Hobby allows hourly; if capped to daily, document Supabase `pg_cron`/GitHub Actions fallback in `docs/DEPLOY.md` and set schedule to the allowed cadence.
- [ ] **Step 3: Manual verify** `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/refresh` upserts rows.
- [ ] **Step 4: Commit** `git commit -am "feat: cron refresh endpoint"`.

### Task 6.2: Manual refresh button + source-error notice

**Files:** Create `app/actions/refresh.ts`, modify `app/feed/page.tsx`

- [ ] **Step 1: Implement** owner-only `triggerRefresh()` server action (checks `currentUser().email ∈ OWNER_EMAILS`), calls aggregate+upsert, `revalidatePath('/feed')`. Feed shows a subtle banner when `errors.length>0`.
- [ ] **Step 2: Commit** `git commit -am "feat: manual refresh + source-error banner"`.

### Task 6.3: Responsive pass + a11y + empty/loading/error states

**Files:** modify components/pages; add `app/loading.tsx`, `app/error.tsx`, `not-found.tsx`

- [ ] **Step 1:** Verify breakpoints at 360px / 768px / 1280px (cards reflow, reader readable, tab bar collapses to a select on mobile, MarkButton thumb-reachable). Add focus rings, aria-labels on icon buttons, `prefers-color-scheme` dark mode.
- [ ] **Step 2:** Loading skeletons for feed/reader; friendly empty states (no stars, no feed yet); route-level error boundary.
- [ ] **Step 3: Commit** `git commit -am "polish: responsive, a11y, loading/empty/error states"`.

### Task 6.4: Deploy docs + final verification

**Files:** Create `docs/DEPLOY.md`, `README.md`

- [ ] **Step 1:** `README.md` (run locally, env setup, `npx supabase start`, seed via refresh) + `docs/DEPLOY.md` (create Supabase project, run migration, configure Google OAuth redirect, set Vercel env vars, set cron, confirmed cron cadence).
- [ ] **Step 2: Full gate** — `pnpm typecheck && pnpm test && pnpm build` all green.
- [ ] **Step 3: Commit** `git commit -am "docs: deploy + readme; final verification"`.

---

## Self-Review (completed)

**Spec coverage:** Responsive (3.2/6.3) · multi-source aggregation (Phase 5) · one corpus + dedup (2.3) · Latest/Trending/Famous views (2.4/3.2) · star + library (3.3/3.4) · reader HTML+PDF with resume + highlight (Phase 4) · sync via Supabase + RLS (Phase 1/auth) · Google Scholar flagged owner-only (5.4/6.2) · freshness/cron with verify (6.1) · error isolation (5.5) · MVP slice = Phases 0–4. All spec sections map to tasks.

**Placeholder scan:** No TBD/TODO; the two "VERIFY" items (PwC API alive, Vercel cron cadence) are explicit runtime verifications with defined fallbacks, not gaps.

**Type consistency:** `NormalizedPaper`/`signals` shape consistent across adapters, dedupe, upsert; `ProgressRow` fields (`scrollPct/blockAnchor/markedAnchor`) consistent across anchor logic, persistence, and reader components; `getFeed`/`trendingScore`/`aggregate`/`upsertPapers` signatures stable across callers.
