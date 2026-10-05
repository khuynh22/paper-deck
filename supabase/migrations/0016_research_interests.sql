create table public.research_interests (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  query_text text not null default '' check (length(query_text)<=300),
  topic text not null default '' check (topic='' or topic ~ '^[a-zA-Z0-9][a-zA-Z0-9.-]{0,63}$'),
  venue text not null default '' check (length(venue)<=120),
  author_name text not null default '' check (length(author_name)<=200),
  from_date date, to_date date, exact_arxiv text,
  paused boolean not null default false, last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique(id,user_id),
  check (from_date is null or to_date is null or from_date<=to_date),
  check (query_text<>'' or topic<>'' or venue<>'' or author_name<>'' or from_date is not null or to_date is not null)
);
create index research_interests_owner_idx on public.research_interests(user_id,id);
alter table public.research_interests enable row level security;
create policy interest_owner on public.research_interests for all to authenticated
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
grant select,insert,update,delete on public.research_interests to authenticated;

create table public.interest_matches (
  interest_id uuid not null, user_id uuid not null, paper_id uuid not null references public.papers(id) on delete cascade,
  first_matched_at timestamptz not null default now(), primary key(interest_id,paper_id),
  foreign key(interest_id,user_id) references public.research_interests(id,user_id) on delete cascade
);
create index interest_matches_owner_idx on public.interest_matches(user_id,first_matched_at desc,paper_id);
alter table public.interest_matches enable row level security;
create policy match_owner on public.interest_matches for all to authenticated
  using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
grant select,insert,update,delete on public.interest_matches to authenticated;

-- Same AND-combined criteria as discovery, plus whole author-name equality.
-- Author IDs are not in this corpus; identical names intentionally match together.
create function public.paper_matches_interest(p public.papers,i public.research_interests)
returns boolean language sql stable security invoker set search_path=public as $$
 select (i.exact_arxiv is null or p.arxiv_id=i.exact_arxiv)
 and (i.query_text='' or i.exact_arxiv is not null or p.search_vector @@ websearch_to_tsquery('english',i.query_text))
 and (i.topic='' or p.categories @> array[i.topic])
 and (i.venue='' or lower(p.venue)=lower(i.venue))
 and (i.author_name='' or exists(select from unnest(p.authors) a where lower(btrim(a))=lower(btrim(i.author_name))))
 and (i.from_date is null or p.published_at >= (i.from_date::timestamp at time zone 'UTC'))
 and (i.to_date is null or p.published_at < ((i.to_date+1)::timestamp at time zone 'UTC'));
$$;

create function public.check_interest_matches() returns timestamptz
language plpgsql security invoker set search_path=public as $$
declare checked timestamptz:=clock_timestamp();
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  -- Per-user lock prevents a later check from passing an earlier in-flight check.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,55));
  checked:=date_trunc('milliseconds',clock_timestamp());
  insert into interest_matches(interest_id,user_id,paper_id,first_matched_at)
  select i.id,i.user_id,p.id,checked from research_interests i cross join papers p
  where i.user_id=auth.uid() and not i.paused and paper_matches_interest(p,i)
  on conflict(interest_id,paper_id) do nothing;
  return checked;
end $$;

create function public.interest_updates(as_of timestamptz default now(),page_limit integer default 41,page_offset integer default 0)
returns table(paper jsonb,reasons jsonb,is_new boolean,matched_at timestamptz)
language sql stable security invoker set search_path=public as $$
  select to_jsonb(p),jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'query',i.query_text,'topic',i.topic,'venue',i.venue,'author',i.author_name,'from',i.from_date,'to',i.to_date) order by i.name,i.id),
    bool_or(m.first_matched_at>coalesce(i.last_seen_at,'-infinity'::timestamptz)),max(m.first_matched_at)
  from interest_matches m join research_interests i on i.id=m.interest_id and i.user_id=m.user_id
  join papers p on p.id=m.paper_id
  where m.user_id=(select auth.uid()) and not i.paused and m.first_matched_at<=coalesce(as_of,now()) and paper_matches_interest(p,i)
  group by p.id order by max(m.first_matched_at) desc,p.id
  limit greatest(1,least(coalesce(page_limit,41),100)) offset greatest(0,least(coalesce(page_offset,0),100000));
$$;

create function public.mark_interest_updates_seen(through_time timestamptz) returns void
language sql security invoker set search_path=public as $$
  update research_interests set last_seen_at=greatest(coalesce(last_seen_at,'-infinity'::timestamptz),least(through_time,now()))
  where user_id=(select auth.uid()) and not paused and through_time is not null;
$$;
revoke all on function public.paper_matches_interest(public.papers,public.research_interests) from public;
revoke all on function public.check_interest_matches() from public;
revoke all on function public.interest_updates(timestamptz,integer,integer) from public;
revoke all on function public.mark_interest_updates_seen(timestamptz) from public;
grant execute on function public.paper_matches_interest(public.papers,public.research_interests),public.check_interest_matches(),public.interest_updates(timestamptz,integer,integer),public.mark_interest_updates_seen(timestamptz) to authenticated,service_role;
