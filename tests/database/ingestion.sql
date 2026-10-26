do $$
declare r record;
begin
  select * into r from merge_papers('[{"arxiv_id":"test-arxiv","doi":"10.test/paper","title":"Enriched","citations":55,"hf_upvotes":7,"pwc_stars":4,"venue":"Conference","abstract":"Abstract","pdf_url":"https://example.com/p.pdf","authors":["A"]}]');
  if r.outcome <> 'inserted' then raise exception 'enriched insert: %', r; end if;
  select * into r from merge_papers('[{"arxiv_id":"test-arxiv","title":"Enriched"}]');
  if r.outcome <> 'skipped' then raise exception 'partial outcome: %', r; end if;
  if not exists(select 1 from papers where arxiv_id='test-arxiv' and citations=55 and hf_upvotes=7 and pwc_stars=4 and venue='Conference' and abstract='Abstract' and authors=array['A']) then
    raise exception 'partial import erased metadata';
  end if;
  select * into r from merge_papers('[{"arxiv_id":"test-arxiv","title":"Enriched","citations":0,"hf_upvotes":0,"pwc_stars":0}]');
  if r.outcome <> 'updated' or not exists(select 1 from papers where arxiv_id='test-arxiv' and citations=0 and hf_upvotes=0 and pwc_stars=0) then
    raise exception 'explicit zero lost';
  end if;
  select * into r from merge_papers('[{"doi":"10.TEST/PAPER","title":"Enriched"}]');
  if r.outcome <> 'skipped' or (select count(*) from papers) <> 1 then raise exception 'DOI not idempotent'; end if;
  select count(*) filter (where outcome='inserted') as inserted,
         count(*) filter (where outcome='skipped') as skipped,
         count(*) filter (where outcome='failed') as failed
    into r from merge_papers('[{"doi":"10.test/paper","title":"Enriched"},{"doi":"10.test/new","title":"New"},{"doi":"10.test/bad"}]');
  if r.inserted <> 1 or r.skipped <> 1 or r.failed <> 1 or (select count(*) from papers) <> 2 then
    raise exception 'mixed batch outcomes do not match stored rows: %', r;
  end if;
  if not exists(select 1 from papers where doi='10.test/new') then raise exception 'new row missing'; end if;
  insert into papers(doi,title) values('10.test/ambiguous','Legacy A'),('10.TEST/AMBIGUOUS','Legacy B');
  select * into r from merge_papers('[{"doi":"10.test/ambiguous","title":"No destructive merge"}]');
  if r.outcome <> 'failed' then raise exception 'ambiguous identity accepted'; end if;
  if has_function_privilege('anon','public.merge_papers(jsonb)','execute') or has_function_privilege('authenticated','public.merge_papers(jsonb)','execute') then
    raise exception 'private RPC exposed';
  end if;
  if not has_function_privilege('service_role','public.merge_papers(jsonb)','execute') then raise exception 'service RPC denied'; end if;
end;
$$;

-- The API caller uses the service role, not the migration owner. Exercise its
-- real INSERT/UPDATE path as that role, in addition to checking EXECUTE grants.
set role service_role;
do $$
declare r record;
begin
  select * into r from public.merge_papers('[{"doi":"10.test/service","title":"Service import","citations":1}]');
  if r.outcome <> 'inserted' then raise exception 'service role insert failed: %', r; end if;
  select * into r from public.merge_papers('[{"doi":"10.test/service","title":"Service import","citations":0}]');
  if r.outcome <> 'updated' then raise exception 'service role update failed: %', r; end if;
end;
$$;
reset role;

do $$
declare
  r record;
  problems text[] := '{}';
begin
  select * into r from merge_papers('[{"doi":" 10.TEST/Trim ","title":" Trimmed ","abstract":"  ","html_url":"  ","pdf_url":" ","source_url":" ","venue":"  "}]');
  if r.outcome <> 'inserted' or not exists(select 1 from papers where doi='10.test/trim' and title='Trimmed' and abstract is null and html_url is null and pdf_url is null and source_url is null and venue is null) then
    problems := array_append(problems, 'insert normalization');
  end if;
  select * into r from merge_papers('[{"doi":"10.test/trim","title":" Trimmed ","html_url":"  "}]');
  if r.outcome <> 'skipped' then problems := array_append(problems, 'normalized retry'); end if;

  perform merge_papers('[{"arxiv_id":"test-alias","doi":"10.48550/arXiv.test-alias","title":"Alias"}]');
  select * into r from merge_papers('[{"arxiv_id":"test-alias","doi":"10.test/journal","title":"Alias"}]');
  if r.outcome <> 'updated' or not exists(select 1 from papers where arxiv_id='test-alias' and doi='10.test/journal') then
    problems := array_append(problems, 'journal DOI enrichment');
  end if;
  select * into r from merge_papers('[{"arxiv_id":"test-alias","doi":"10.48550/arxiv.test-alias","title":"Alias"}]');
  if r.outcome <> 'skipped' or not exists(select 1 from papers where arxiv_id='test-alias' and doi='10.test/journal') then
    problems := array_append(problems, 'arxiv DOI retry');
  end if;

  perform merge_papers('[{"arxiv_id":"test-rich","title":"Rich","authors":["A","B","C"],"published_at":"2026-07-15T10:30:00Z"}]');
  select * into r from merge_papers('[{"arxiv_id":"test-rich","title":"Rich","authors":["A"],"published_at":"2025-01-01T00:00:00Z"}]');
  if r.outcome <> 'skipped' or not exists(select 1 from papers where arxiv_id='test-rich' and authors=array['A','B','C'] and published_at='2026-07-15T10:30:00Z') then
    problems := array_append(problems, 'richer authors/date preservation');
  end if;
  select * into r from merge_papers('[{"arxiv_id":"test-rich","title":"Rich","published_at":"2026-07-16T10:30:00Z"}]');
  if r.outcome <> 'updated' then problems := array_append(problems, 'precise date replacement'); end if;

  perform merge_papers('[{"arxiv_id":"test-other","doi":"10.test/occupied","title":"Other"}]');
  select * into r from merge_papers('[{"arxiv_id":"test-alias","doi":"10.test/occupied","title":"Conflict"}]');
  if r.outcome <> 'failed' or not exists(select 1 from papers where arxiv_id='test-other' and title='Other') then
    problems := array_append(problems, 'conflicting existing identities');
  end if;
  select * into r from merge_papers('[{"arxiv_id":"different-arxiv","doi":"10.test/occupied","title":"Conflict"}]');
  if r.outcome <> 'failed' then problems := array_append(problems, 'conflicting arxiv identities'); end if;
  select * into r from merge_papers('[{"arxiv_id":"test-alias","doi":"10.test/journal","doi_aliases":["10.test/occupied"],"title":"Hidden conflict","citations":999}]');
  if r.outcome <> 'failed' or exists(select 1 from papers where arxiv_id='test-alias' and citations=999) then
    problems := array_append(problems, 'deduplicated DOI alias validation');
  end if;
  select * into r from merge_papers('[{"title":"Bad date","published_at":"not-a-date"},{"title":"After bad date","doi":"10.test/after-bad-date"}]') where input_index=1;
  if r.outcome <> 'inserted' then problems := array_append(problems, 'bad timestamp isolation'); end if;
  if cardinality(problems) > 0 then raise exception 'regressions: %', problems; end if;
end;
$$;
