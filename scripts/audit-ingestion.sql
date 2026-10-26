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

rollback;
