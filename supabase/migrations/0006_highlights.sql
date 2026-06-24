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
