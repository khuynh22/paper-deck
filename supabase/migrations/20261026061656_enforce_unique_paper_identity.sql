-- Requires a maintenance writer pause and a recoverable backup; see
-- docs/INGESTION.md. Never choose between differing user states implicitly.
-- Entire cleanup/index/function replacement is atomic, including on replay.
begin;
set local lock_timeout = '5s';
lock table public.papers, public.paper_content, public.stars, public.reading_progress, public.highlights in access exclusive mode;

do $$
begin
  if exists(select 1 from pg_constraint where contype='f' and confrelid='public.papers'::regclass
    and conrelid not in ('public.paper_content'::regclass,'public.stars'::regclass,'public.reading_progress'::regclass,'public.highlights'::regclass)
    and conrelid<>coalesce(to_regclass('public.paper_redirects'),0)) then
    raise exception 'Unexpected paper foreign key: extend identity repair before migrating';
  end if;
end $$;

create temp table identity_groups on commit drop as
select lower(btrim(doi)) as doi,
  array_agg(id order by (nullif(btrim(arxiv_id),'') is not null) desc,fetched_at,id) as ids
from public.papers where nullif(btrim(doi),'') is not null
group by lower(btrim(doi)) having count(*)>1;

create temp table identity_conflicts on commit drop as
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
],null) as reasons from identity_groups g;

do $$
declare conflicts text;
begin
  select string_agg(doi||' ['||array_to_string(reasons,',')||']','; ' order by doi) into conflicts
    from identity_conflicts where cardinality(reasons)>0;
  if conflicts is not null then raise exception 'Unsafe duplicate DOI groups: %',conflicts; end if;
end $$;

create schema if not exists paperdeck_ingestion_backup;
revoke all on schema paperdeck_ingestion_backup from public,anon,authenticated,service_role;
create table if not exists paperdeck_ingestion_backup.paper_merges (
  original_id uuid primary key,
  canonical_id uuid not null,
  normalized_doi text not null,
  paper jsonb not null,
  content jsonb,
  stars jsonb not null,
  progress jsonb not null,
  highlights jsonb not null,
  captured_at timestamptz not null default now()
);
alter table paperdeck_ingestion_backup.paper_merges enable row level security;
revoke all on paperdeck_ingestion_backup.paper_merges from public,anon,authenticated,service_role;

create table if not exists public.paper_redirects (
  paper_id uuid primary key,
  canonical_id uuid not null references public.papers(id) on delete restrict,
  check(paper_id<>canonical_id)
);
alter table public.paper_redirects enable row level security;
drop policy if exists "paper redirects public read" on public.paper_redirects;
create policy "paper redirects public read" on public.paper_redirects for select using(true);
revoke all on public.paper_redirects from public,anon,authenticated,service_role;
grant select on public.paper_redirects to anon,authenticated,service_role;
lock table public.paper_redirects in access exclusive mode;

do $$
declare
  g record;
  winner public.papers%rowtype;
  candidate public.papers%rowtype;
  cached public.paper_content%rowtype;
  losers uuid[];
begin
  for g in select * from identity_groups order by doi loop
    select * into winner from public.papers where id=g.ids[1];
    losers:=g.ids[2:cardinality(g.ids)];
    insert into paperdeck_ingestion_backup.paper_merges(original_id,canonical_id,normalized_doi,paper,content,stars,progress,highlights)
    select p.id,winner.id,g.doi,to_jsonb(p),
      (select to_jsonb(c) from public.paper_content c where c.paper_id=p.id),
      coalesce((select jsonb_agg(to_jsonb(s)) from public.stars s where s.paper_id=p.id),'[]'),
      coalesce((select jsonb_agg(to_jsonb(r)) from public.reading_progress r where r.paper_id=p.id),'[]'),
      coalesce((select jsonb_agg(to_jsonb(h)) from public.highlights h where h.paper_id=p.id),'[]')
    from public.papers p where p.id=any(g.ids) on conflict(original_id) do nothing;

    for candidate in select * from public.papers where id=any(g.ids) order by updated_at desc,id loop
      winner.arxiv_id:=coalesce(nullif(btrim(winner.arxiv_id),''),nullif(btrim(candidate.arxiv_id),''));
      if cardinality(candidate.authors)>cardinality(winner.authors) then winner.authors:=candidate.authors; end if;
      winner.categories:=array(select distinct value from unnest(winner.categories||candidate.categories) value order by value);
      winner.abstract:=coalesce(nullif(btrim(winner.abstract),''),nullif(btrim(candidate.abstract),''));
      winner.venue:=coalesce(nullif(btrim(winner.venue),''),nullif(btrim(candidate.venue),''));
      winner.html_url:=coalesce(nullif(btrim(winner.html_url),''),nullif(btrim(candidate.html_url),''));
      winner.pdf_url:=coalesce(nullif(btrim(winner.pdf_url),''),nullif(btrim(candidate.pdf_url),''));
      winner.source_url:=coalesce(nullif(btrim(winner.source_url),''),nullif(btrim(candidate.source_url),''));
      if winner.published_at is null or (winner.published_at=date_trunc('year',winner.published_at,'UTC')
        and candidate.published_at<>date_trunc('year',candidate.published_at,'UTC')) then winner.published_at:=candidate.published_at; end if;
      winner.citations:=greatest(winner.citations,candidate.citations);
      winner.hf_upvotes:=greatest(winner.hf_upvotes,candidate.hf_upvotes);
      winner.pwc_stars:=greatest(winner.pwc_stars,candidate.pwc_stars);
    end loop;

    insert into public.stars(user_id,paper_id,created_at)
      select user_id,winner.id,min(created_at) from public.stars where paper_id=any(g.ids) group by user_id
      on conflict(user_id,paper_id) do update set created_at=least(stars.created_at,excluded.created_at);
    delete from public.stars where paper_id=any(losers);
    insert into public.reading_progress(user_id,paper_id,scroll_pct,block_anchor,marked_anchor,reader_kind,status,updated_at,read_pct,marked_pct)
      select distinct on(user_id) user_id,winner.id,scroll_pct,block_anchor,marked_anchor,reader_kind,status,updated_at,read_pct,marked_pct
      from public.reading_progress where paper_id=any(g.ids) order by user_id,updated_at desc,paper_id
      on conflict(user_id,paper_id) do update set updated_at=greatest(reading_progress.updated_at,excluded.updated_at);
    delete from public.reading_progress where paper_id=any(losers);
    update public.highlights set paper_id=winner.id where paper_id=any(losers);
    select * into cached from public.paper_content where paper_id=any(g.ids) order by (paper_id=winner.id) desc,fetched_at desc,paper_id limit 1;
    if found then
      insert into public.paper_content(paper_id,kind,sanitized_html,page_count,fetched_at)
      values(winner.id,cached.kind,cached.sanitized_html,cached.page_count,cached.fetched_at)
      on conflict(paper_id) do update set kind=excluded.kind,sanitized_html=excluded.sanitized_html,page_count=excluded.page_count,fetched_at=excluded.fetched_at;
    end if;
    delete from public.paper_content where paper_id=any(losers);
    update public.paper_redirects set canonical_id=winner.id where canonical_id=any(losers);
    insert into public.paper_redirects(paper_id,canonical_id) select id,winner.id from unnest(losers) id
      on conflict(paper_id) do update set canonical_id=excluded.canonical_id;
    if exists(select 1 from public.stars where paper_id=any(losers)) or exists(select 1 from public.reading_progress where paper_id=any(losers))
      or exists(select 1 from public.highlights where paper_id=any(losers)) or exists(select 1 from public.paper_content where paper_id=any(losers)) then
      raise exception 'Unmoved user references in DOI group %',g.doi;
    end if;
    delete from public.papers where id=any(losers);
    update public.papers set arxiv_id=winner.arxiv_id,doi=g.doi,authors=winner.authors,categories=winner.categories,
      abstract=winner.abstract,venue=winner.venue,html_url=winner.html_url,pdf_url=winner.pdf_url,source_url=winner.source_url,
      published_at=winner.published_at,citations=winner.citations,hf_upvotes=winner.hf_upvotes,pwc_stars=winner.pwc_stars,updated_at=now()
      where id=winner.id;
  end loop;
end $$;

update public.papers set doi=null where doi is not null and btrim(doi)='';
create unique index if not exists papers_doi_normalized_unique_idx on public.papers(lower(btrim(doi))) where doi is not null;
drop index if exists public.papers_doi_normalized_idx;
create or replace function public.merge_papers(incoming jsonb)
returns table(input_index integer, paper_id uuid, outcome text)
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  item jsonb;
  candidate public.papers%rowtype;
  existing public.papers%rowtype;
  merged public.papers%rowtype;
  matches uuid[];
  dois text[];
  idx integer := 0;
  batch_arxiv text[];
  batch_dois text[];
  lock_key bigint;
  attempt integer;
begin
  if incoming is null or jsonb_typeof(incoming) <> 'array' or jsonb_array_length(incoming) > 100 then
    raise exception 'Expected at most 100 papers';
  end if;
  select array_agg(distinct nullif(btrim(value->>'arxiv_id'),'')) into batch_arxiv from jsonb_array_elements(incoming);
  select array_agg(distinct nullif(lower(btrim(doi)),'')) into batch_dois from (
    select value->>'doi' as doi from jsonb_array_elements(incoming)
    union all
    select alias from jsonb_array_elements(incoming) batch_item
      cross join lateral jsonb_array_elements_text(case when jsonb_typeof(batch_item->'doi_aliases')='array' then batch_item->'doi_aliases' else '[]'::jsonb end) alias
  ) identities;
  for lock_key in select distinct hashtextextended(identity,0) from (
    select 'paperdeck:arxiv:'||value as identity from unnest(batch_arxiv) value where value is not null
    union all select 'paperdeck:doi:'||value from unnest(batch_dois) value where value is not null
  ) keys order by 1 loop
    perform pg_advisory_xact_lock(lock_key);
  end loop;
  -- Different identifiers can address the same rows; order those locks too.
  perform p.id from public.papers p where p.arxiv_id=any(batch_arxiv) or lower(btrim(p.doi))=any(batch_dois) order by p.id for update;
  for item in select value from jsonb_array_elements(incoming) loop
    input_index := idx;
    idx := idx + 1;
    paper_id := null;
    begin
      candidate := jsonb_populate_record(null::public.papers, item);
      candidate.arxiv_id := nullif(btrim(candidate.arxiv_id), '');
      candidate.doi := nullif(lower(btrim(candidate.doi)), '');
      dois := array(select distinct lower(btrim(value))
        from jsonb_array_elements_text(coalesce(item->'doi_aliases', '[]'::jsonb)) value
        where nullif(btrim(value), '') is not null);
      dois := array_append(dois, candidate.doi);
      candidate.title := nullif(btrim(candidate.title), '');
      candidate.abstract := nullif(btrim(candidate.abstract), '');
      candidate.html_url := nullif(btrim(candidate.html_url), '');
      candidate.pdf_url := nullif(btrim(candidate.pdf_url), '');
      candidate.source_url := nullif(btrim(candidate.source_url), '');
      candidate.venue := nullif(btrim(candidate.venue), '');
      candidate.authors := array(select btrim(value) from unnest(candidate.authors) value where nullif(btrim(value), '') is not null);
      candidate.categories := array(select btrim(value) from unnest(candidate.categories) value where nullif(btrim(value), '') is not null);
      if candidate.title is null then
        raise exception 'Missing title';
      end if;
      for attempt in 1..3 loop
      select array_agg(p.id) into matches from public.papers p
      where (candidate.arxiv_id is not null and p.arxiv_id = candidate.arxiv_id)
         or lower(btrim(p.doi)) = any(dois);
      if cardinality(matches) > 1 then
        raise exception 'Ambiguous paper identity';
      end if;
      if cardinality(matches) = 1 then
        select * into existing from public.papers where id = matches[1] for update;
        if not found then continue; end if;
        if candidate.arxiv_id is not null and existing.arxiv_id is not null
            and candidate.arxiv_id <> existing.arxiv_id then
          raise exception 'Conflicting paper identity';
        end if;
        merged := existing;
        merged.arxiv_id := coalesce(candidate.arxiv_id, existing.arxiv_id);
        merged.doi := case
          when lower(btrim(existing.doi)) like '10.48550/arxiv.%'
            and candidate.doi not like '10.48550/arxiv.%' then candidate.doi
          else coalesce(existing.doi, candidate.doi) end;
        merged.title := candidate.title;
        merged.authors := case when cardinality(candidate.authors) > 0
          and cardinality(candidate.authors) >= cardinality(existing.authors) then candidate.authors else existing.authors end;
        merged.categories := case when cardinality(candidate.categories) > 0 then candidate.categories else existing.categories end;
        merged.abstract := coalesce(candidate.abstract, existing.abstract);
        merged.html_url := coalesce(candidate.html_url, existing.html_url);
        merged.pdf_url := coalesce(candidate.pdf_url, existing.pdf_url);
        merged.source_url := coalesce(candidate.source_url, existing.source_url);
        -- Adapters encode year-only dates as January 1 at midnight UTC.
        merged.published_at := case when existing.published_at is not null
          and candidate.published_at = date_trunc('year', candidate.published_at, 'UTC')
          then existing.published_at else coalesce(candidate.published_at, existing.published_at) end;
        merged.venue := coalesce(candidate.venue, existing.venue);
        merged.hf_upvotes := coalesce(candidate.hf_upvotes, existing.hf_upvotes);
        merged.pwc_stars := coalesce(candidate.pwc_stars, existing.pwc_stars);
        merged.citations := coalesce(candidate.citations, existing.citations);
        paper_id := existing.id;
        if merged is not distinct from existing then
          outcome := 'skipped';
        else
          update public.papers set
            arxiv_id = merged.arxiv_id,
            doi = merged.doi,
            title = merged.title,
            authors = merged.authors,
            categories = merged.categories,
            abstract = merged.abstract,
            html_url = merged.html_url,
            pdf_url = merged.pdf_url,
            source_url = merged.source_url,
            published_at = merged.published_at,
            venue = merged.venue,
            hf_upvotes = merged.hf_upvotes,
            pwc_stars = merged.pwc_stars,
            citations = merged.citations,
            updated_at = now()
          where id = existing.id;
          outcome := 'updated';
        end if;
        exit;
      else
        insert into public.papers (arxiv_id, doi, title, authors, categories, abstract, html_url, pdf_url, source_url, published_at, venue, hf_upvotes, pwc_stars, citations)
        values (candidate.arxiv_id, candidate.doi, candidate.title, coalesce(candidate.authors, '{}'), coalesce(candidate.categories, '{}'), candidate.abstract, candidate.html_url, candidate.pdf_url, candidate.source_url, candidate.published_at, candidate.venue, coalesce(candidate.hf_upvotes, 0), coalesce(candidate.pwc_stars, 0), coalesce(candidate.citations, 0))
        on conflict do nothing returning id into paper_id;
        if paper_id is not null then
          outcome := 'inserted';
          exit;
        end if;
      end if;
      end loop;
      if paper_id is null then raise exception 'Concurrent paper identity changed; retry'; end if;
    exception when others then
      raise warning 'merge_papers input % failed [%]: %', input_index, sqlstate, sqlerrm;
      paper_id := null;
      outcome := 'failed';
    end;
    return next;
  end loop;
end;
$$;
revoke all on function public.merge_papers(jsonb) from public, anon, authenticated;
grant execute on function public.merge_papers(jsonb) to service_role;


notify pgrst, 'reload schema';
commit;
