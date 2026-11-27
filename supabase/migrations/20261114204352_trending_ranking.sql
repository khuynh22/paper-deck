create or replace function public.trending_papers(
  as_of timestamptz default now(),
  page_limit integer default 40,
  page_offset integer default 0
) returns setof public.papers
language sql stable security invoker
set search_path = ''
as $$
  select p.* from public.papers p
  order by
    (greatest(p.hf_upvotes, 0)::double precision * 3
      + ln(1 + greatest(p.pwc_stars, 0)::double precision) * 5) *
    (0.3 + exp(-least(greatest(coalesce(
      case when isfinite(p.published_at) then (
        extract(epoch from case when isfinite(as_of) then as_of else now() end)::double precision
        - extract(epoch from p.published_at)::double precision
      ) / 86400 end,
      3650
    ), 0), 10000) / 14)) desc,
    p.id asc
  limit greatest(1, least(coalesce(page_limit, 40), 100))
  offset greatest(0, least(coalesce(page_offset, 0), 100000));
$$;

revoke all on function public.trending_papers(timestamptz, integer, integer) from public;
grant execute on function public.trending_papers(timestamptz, integer, integer) to anon, authenticated, service_role;
