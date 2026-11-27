create or replace function public.paper_trending_score(
  hf integer, pwc integer, published timestamptz, as_of timestamptz
) returns double precision
language sql immutable parallel safe security invoker
as $$
  select
    (greatest(hf, 0)::double precision * 3
      + ln(1 + greatest(pwc, 0)::double precision) * 5) *
    (0.3 + exp(-least(greatest(coalesce(
      case when isfinite(published) then (
        extract(epoch from as_of)::double precision
        - extract(epoch from published)::double precision
      ) / 86400 end,
      3650
    ), 0), 10000) / 14));
$$;

revoke all on function public.paper_trending_score(integer, integer, timestamptz, timestamptz) from public;
grant execute on function public.paper_trending_score(integer, integer, timestamptz, timestamptz) to anon, authenticated, service_role;

-- Keep the existing ranking RPC and use its score policy in both queries.
create or replace function public.trending_papers(
  as_of timestamptz default now(),
  page_limit integer default 40,
  page_offset integer default 0
) returns setof public.papers
language sql stable security invoker
set search_path = ''
as $$
  select p.* from public.papers p
  order by public.paper_trending_score(
    p.hf_upvotes, p.pwc_stars, p.published_at, case when isfinite(as_of) then as_of else now() end
  ) desc, p.id
  limit greatest(1, least(coalesce(page_limit, 40), 100))
  offset greatest(0, least(coalesce(page_offset, 0), 100000));
$$;

create or replace function public.discover_papers(
  query_text text default '', sort_mode text default 'latest',
  filter_topic text default null, filter_venue text default null,
  filter_from date default null, filter_to date default null,
  exact_arxiv text default null, as_of timestamptz default now(),
  page_limit integer default 41, page_offset integer default 0
) returns setof public.papers language sql stable security invoker as $$
  with args as (
    select case when nullif(btrim(query_text),'') is not null and exact_arxiv is null
      then websearch_to_tsquery('english',query_text) end as query,
      case when sort_mode in ('latest','trending','famous','search') then sort_mode else 'latest' end as mode
  )
  select p.* from public.papers p cross join args a
  where (a.query is null or p.search_vector @@ a.query)
    and (exact_arxiv is null or p.arxiv_id = exact_arxiv)
    and (filter_topic is null or p.categories @> array[filter_topic])
    and (filter_venue is null or lower(p.venue) = lower(filter_venue))
    and (filter_from is null or p.published_at >= (filter_from::timestamp at time zone 'UTC'))
    and (filter_to is null or p.published_at < ((filter_to + 1)::timestamp at time zone 'UTC'))
  order by
    case when a.mode = 'trending' then public.paper_trending_score(
      p.hf_upvotes, p.pwc_stars, p.published_at, case when isfinite(as_of) then as_of else now() end
    ) end desc nulls last,
    case when a.mode='famous' then p.citations end desc nulls last,
    case when a.mode='search' then ts_rank(p.search_vector,a.query) end desc nulls last,
    case when a.mode in ('latest','search') then p.published_at end desc nulls last,
    p.id asc
  limit greatest(1,least(coalesce(page_limit,41),100))
  offset greatest(0,least(coalesce(page_offset,0),100000));
$$;

revoke all on function public.discover_papers(text,text,text,text,date,date,text,timestamptz,integer,integer) from public;
grant execute on function public.discover_papers(text,text,text,text,date,date,text,timestamptz,integer,integer) to anon,authenticated,service_role;

-- Selective venue queries reduced buffer hits from 8444 to 506 on 50k rows.
create index if not exists papers_venue_lower_idx on public.papers(lower(venue));
