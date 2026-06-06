# PaperDeck

Your AI/ML research, on one deck. A responsive, multi-user web app that aggregates
AI/ML papers (Latest / Trending / Famous), lets you star papers to read, and reads
them in-app with **scroll-resume** and a **"read up to here" highlight** — synced
across your phone and PC.

## Features

- **One deduplicated corpus, three views** — Latest (arXiv), Trending (Hugging Face
  upvotes + recency), Famous (citations). Papers are merged across sources by arXiv ID.
- **Sources** — arXiv, Hugging Face Daily Papers, Semantic Scholar, Google Scholar
  (owner-only, flagged). _Papers With Code is included but disabled by default — its
  public API was retired in 2026._
- **Star to read later** — a personal library synced via your account.
- **In-app reader** — arXiv HTML (MathML-safe, sanitized) with block-level resume +
  highlight; a `pdf.js` fallback with page-level resume + highlight for PDF-only papers
  (e.g. older "famous" classics).
- **Resume where you left off** — your scroll position and a "I finished here" marker
  persist per paper, per user.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Supabase
(Postgres + Auth + RLS) · Vitest. Deploys on Vercel.

## Local development

Prerequisites: Node 20+, pnpm, Docker (for local Supabase).

```bash
pnpm install

# 1. Start local Supabase (applies migrations in supabase/migrations)
npx supabase start

# 2. Configure env — copy the printed keys into .env.local
cp .env.example .env.local
#    NEXT_PUBLIC_SUPABASE_URL      -> http://127.0.0.1:54321
#    NEXT_PUBLIC_SUPABASE_ANON_KEY -> the publishable key from `supabase status`
#    SUPABASE_SERVICE_ROLE_KEY     -> the secret key from `supabase status`
#    OWNER_EMAILS                  -> your email (enables manual refresh + Scholar)
#    CRON_SECRET                   -> any string

# 3. Run the app
pnpm dev

# 4. Seed the corpus (pulls real papers from the live sources)
curl http://localhost:3000/api/cron/refresh -H "Authorization: Bearer <CRON_SECRET>"
#    ...or sign in as an OWNER_EMAILS user and click "Refresh" on /feed.
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm test` | Unit/integration tests (Vitest) |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |

## Project structure

```
app/            routes (feed, paper, reader, library, login, api/*) + server actions
components/     UI: PaperCard, FeedTabs, reader (HtmlReader/PdfReader/ReaderBar), ...
lib/sources/    one adapter per source -> NormalizedPaper[]
lib/corpus/     dedupe + upsert + feed queries
lib/reader/     sanitize (MathML-safe) + fetch HTML + anchor/resume logic
lib/db/         Supabase clients (browser/server/service) + queries
supabase/       Postgres schema + RLS migration
docs/           design spec, implementation plan, DEPLOY.md
```

## Deployment

See [`docs/DEPLOY.md`](docs/DEPLOY.md).
