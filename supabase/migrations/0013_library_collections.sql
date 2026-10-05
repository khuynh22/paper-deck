create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,user_id)
);
create index collections_owner_idx on public.collections(user_id,name,id);
create unique index collections_owner_name_idx on public.collections(user_id,lower(btrim(name)));
create table public.collection_papers (
  user_id uuid not null references auth.users(id) on delete cascade,
  collection_id uuid not null,
  paper_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(user_id,collection_id,paper_id),
  foreign key(collection_id,user_id) references public.collections(id,user_id) on delete cascade,
  foreign key(user_id,paper_id) references public.stars(user_id,paper_id) on delete cascade
);
create index collection_papers_paper_idx on public.collection_papers(user_id,paper_id,collection_id);
alter table public.collections enable row level security;
alter table public.collection_papers enable row level security;
create policy "collections owner" on public.collections for all to authenticated
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy "collection papers owner" on public.collection_papers for all to authenticated
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
revoke all on public.collections,public.collection_papers from anon;
grant select,insert,update,delete on public.collections,public.collection_papers to authenticated;
grant all on public.collections,public.collection_papers to service_role;

create or replace function public.library_papers(
  query_text text default '', status_filter text default '', sort_mode text default 'newest',
  selected_collection uuid default null, page_limit integer default 41, page_offset integer default 0
) returns table(paper jsonb,reading_status text,read_pct real,collection_ids uuid[])
language sql stable security invoker as $$
  select to_jsonb(p)-'search_vector',coalesce(r.status,'to_read'),greatest(coalesce(r.read_pct,0),coalesce(r.scroll_pct,0)),
    array(select m.collection_id from public.collection_papers m where m.user_id=s.user_id and m.paper_id=p.id order by m.collection_id)
  from public.stars s join public.papers p on p.id=s.paper_id
  left join public.reading_progress r on r.user_id=s.user_id and r.paper_id=p.id
  where s.user_id=(select auth.uid())
    and (nullif(btrim(query_text),'') is null or p.search_vector @@ websearch_to_tsquery('english',query_text))
    and (nullif(status_filter,'') is null or coalesce(r.status,'to_read')=status_filter)
    and (selected_collection is null or exists(select 1 from public.collection_papers m where m.user_id=s.user_id and m.paper_id=p.id and m.collection_id=selected_collection))
  order by case when sort_mode='title' then lower(p.title) end asc,
    case when sort_mode='oldest' then s.created_at end asc,
    case when sort_mode not in ('title','oldest') then s.created_at end desc,
    p.id asc
  limit greatest(1,least(coalesce(page_limit,41),100))
  offset greatest(0,least(coalesce(page_offset,0),100000));
$$;
revoke all on function public.library_papers(text,text,text,uuid,integer,integer) from public,anon;
grant execute on function public.library_papers(text,text,text,uuid,integer,integer) to authenticated,service_role;
