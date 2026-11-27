begin read only;

with duplicate_dois as (
  select lower(btrim(doi)) as doi, count(*) as copies
  from public.papers
  where nullif(btrim(doi), '') is not null
  group by lower(btrim(doi)) having count(*) > 1
)
select count(*) as duplicate_doi_groups, coalesce(sum(copies - 1), 0) as extra_rows
from duplicate_dois;

with duplicate_dois as (
  select lower(btrim(doi)) as doi, array_agg(id order by id) as paper_ids,
    array_agg(distinct arxiv_id) filter (where arxiv_id is not null) as arxiv_ids
  from public.papers
  where nullif(btrim(doi), '') is not null
  group by lower(btrim(doi)) having count(*) > 1
)
select d.*,
  (select count(*) from public.stars where paper_id = any(d.paper_ids)) as stars,
  (select count(*) from public.reading_progress where paper_id = any(d.paper_ids)) as progress_rows,
  (select count(*) from public.highlights where paper_id = any(d.paper_ids)) as highlights,
  (select count(*) from public.paper_content where paper_id = any(d.paper_ids)) as cached_content
from duplicate_dois d order by d.doi;

-- Same conservative blockers as the corrective migration, without taking locks
-- or changing data. Run on a stable staging copy as well as read-only preflight;
-- concurrent writes can change this result until the maintenance pause.
with groups as (
  select lower(btrim(doi)) doi,array_agg(id) ids from public.papers
  where nullif(btrim(doi),'') is not null group by lower(btrim(doi)) having count(*)>1
), conflicts as (
  select g.doi,array_remove(array[
    case when (select count(distinct nullif(btrim(arxiv_id),'')) from public.papers where id=any(g.ids))>1 then 'arxiv' end,
    case when exists(select user_id from public.reading_progress where paper_id=any(g.ids) group by user_id
      having count(distinct (to_jsonb(reading_progress)-'paper_id'-'updated_at'))>1) then 'progress' end,
    case when exists(select 1 from public.reading_progress where paper_id=any(g.ids) and reader_kind is null) then 'unknown-reader' end,
    case when (exists(select 1 from public.reading_progress where paper_id=any(g.ids)) or exists(select 1 from public.highlights where paper_id=any(g.ids)))
      and (select count(distinct (to_jsonb(paper_content)-'paper_id'-'fetched_at')) from public.paper_content where paper_id=any(g.ids))>1 then 'cache' end,
    case when exists(select 1 from public.reading_progress r left join public.paper_content c on c.paper_id=r.paper_id
      where r.paper_id=any(g.ids) and (c.paper_id is null or (r.reader_kind='html' and (c.kind<>'html' or c.sanitized_html is null))
        or (r.reader_kind='pdf' and (c.kind<>'pdf-meta' or c.page_count is null))))
      or exists(select 1 from public.highlights h left join public.paper_content c on c.paper_id=h.paper_id
        where h.paper_id=any(g.ids) and (c.kind is distinct from 'html' or c.sanitized_html is null)) then 'missing-cache' end,
    case when exists(select 1 from public.reading_progress where paper_id=any(g.ids) and reader_kind='pdf')
      and ((select count(distinct coalesce(pdf_url,'')) from public.papers where id=any(g.ids))>1
        or (select count(distinct coalesce(arxiv_id,'')) from public.papers where id=any(g.ids))>1) then 'pdf' end,
    case when exists(select 1 from public.highlights a join public.highlights b on a.user_id=b.user_id and a.block_anchor=b.block_anchor
      and a.paper_id<>b.paper_id and a.start_offset<b.end_offset and b.start_offset<a.end_offset
      where a.paper_id=any(g.ids) and b.paper_id=any(g.ids)) then 'overlap' end
  ],null) reasons from groups g
)
select doi,reasons from conflicts where cardinality(reasons)>0 order by doi;

rollback;
