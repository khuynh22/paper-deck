# Deploying PaperDeck

PaperDeck deploys as a Next.js app on **Vercel** with a hosted **Supabase** project.
Both have free tiers.

## 1. Create the Supabase project

1. Create a project at <https://supabase.com>.
2. Apply the schema. Either:
   - Link the CLI and push: `npx supabase link --project-ref <ref>` then
     `npx supabase db push`, **or**
   - Paste `supabase/migrations/0001_init.sql` into the Supabase SQL editor and run it.
3. From **Project Settings → API**, copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` / publishable key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` / secret key → `SUPABASE_SERVICE_ROLE_KEY` (keep server-only)

## 2. Configure Google OAuth (optional but recommended)

1. In Supabase: **Authentication → Providers → Google**, enable it and paste a Google
   OAuth client ID/secret (from Google Cloud Console).
2. Add the redirect URL `https://<your-domain>/auth/callback` to both Supabase
   (**Authentication → URL Configuration → Redirect URLs**) and the Google client.
3. Email magic links work out of the box; configure SMTP in Supabase for production
   deliverability.

## 3. Deploy to Vercel

1. Import the repo at <https://vercel.com>.
2. Set Environment Variables (Production + Preview):

   | Variable | Required | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | ✅ | |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | |
   | `NEXT_PUBLIC_SITE_URL` | recommended | absolute origin (e.g. `https://ppdeck.com`) for share/OG links; falls back to the Vercel prod domain, then `localhost` |
   | `SUPABASE_SERVICE_ROLE_KEY` | ✅ | server-only; powers cron refresh + reader cache |
   | `OWNER_EMAILS` | ✅ | comma-separated; enables manual refresh + Google Scholar |
   | `CRON_SECRET` | ✅ | Vercel Cron sends it as `Authorization: Bearer <CRON_SECRET>` |
   | `SEMANTIC_SCHOLAR_API_KEY` | optional | needed for real citation volume |
   | `SERPAPI_KEY` | optional | enables the owner-only Google Scholar source |

3. Deploy. The first deploy reads `vercel.json` and registers the cron job.

## 4. Seed + keep fresh

- **Cron:** `vercel.json` schedules `GET /api/cron/refresh` daily (`0 6 * * *`).
  > **Cadence note:** Vercel's **Hobby** plan limits crons to **once per day**. For
  > more frequent refresh (e.g. hourly), either upgrade to Pro, or schedule an external
  > trigger that hits `/api/cron/refresh` with the `CRON_SECRET` bearer token:
  > - **Supabase `pg_cron`** + `pg_net` to call the endpoint, or
  > - a **GitHub Actions** scheduled workflow (`on: schedule: - cron: "0 * * * *"`)
  >   running `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/refresh`.
- **Manual:** sign in as an `OWNER_EMAILS` user and click **Refresh** on `/feed`.

## Source notes

- **arXiv / Hugging Face** — no key required.
- **Semantic Scholar** — works without a key at low volume (HTTP 429 otherwise); set
  `SEMANTIC_SCHOLAR_API_KEY` for the "Famous" feed.
- **Papers With Code** — public API retired in 2026 (now serves HTML); the adapter is
  disabled by default and degrades to empty if re-enabled.
- **Google Scholar** — no official API. Requires `SERPAPI_KEY` (bills per search) and is
  owner-only/disabled by default to avoid abuse under public signup.
