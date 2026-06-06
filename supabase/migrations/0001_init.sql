-- PaperDeck initial schema
-- One shared corpus (papers + cached content) + per-user stars/progress with RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Shared corpus
-- ---------------------------------------------------------------------------
create table if not exists papers (
  id uuid primary key default gen_random_uuid(),
  arxiv_id text unique,
  doi text,
  title text not null,
  authors text[] not null default '{}',
  abstract text,
  categories text[] not null default '{}',
  html_url text,
  pdf_url text,
  source_url text,
  published_at timestamptz,
  hf_upvotes int not null default 0,
  pwc_stars int not null default 0,
  citations int not null default 0,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists papers_published_idx on papers (published_at desc nulls last);
create index if not exists papers_citations_idx on papers (citations desc);
create index if not exists papers_trending_idx on papers (hf_upvotes desc, pwc_stars desc);

-- Cached, sanitized reader payload (fetch + sanitize once, not per open).
create table if not exists paper_content (
  paper_id uuid primary key references papers(id) on delete cascade,
  kind text not null check (kind in ('html', 'pdf-meta')),
  sanitized_html text,
  page_count int,
  fetched_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Per-user data
-- ---------------------------------------------------------------------------
create table if not exists stars (
  user_id uuid not null references auth.users(id) on delete cascade,
  paper_id uuid not null references papers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, paper_id)
);
create index if not exists stars_user_idx on stars (user_id, created_at desc);

create table if not exists reading_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  paper_id uuid not null references papers(id) on delete cascade,
  scroll_pct real not null default 0,
  block_anchor text,
  marked_anchor text,
  reader_kind text check (reader_kind in ('html', 'pdf')),
  status text not null default 'to_read' check (status in ('to_read', 'reading', 'done')),
  updated_at timestamptz not null default now(),
  primary key (user_id, paper_id)
);
create index if not exists progress_reading_idx on reading_progress (user_id, status, updated_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table papers enable row level security;
alter table paper_content enable row level security;
alter table stars enable row level security;
alter table reading_progress enable row level security;

-- Corpus is world-readable; writes happen only via the service role (cron + reader cache),
-- which bypasses RLS, so no write policy is defined here.
drop policy if exists "papers public read" on papers;
create policy "papers public read" on papers for select using (true);

drop policy if exists "content public read" on paper_content;
create policy "content public read" on paper_content for select using (true);

-- Per-user tables: a user may only touch their own rows.
drop policy if exists "stars owner" on stars;
create policy "stars owner" on stars
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "progress owner" on reading_progress;
create policy "progress owner" on reading_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
