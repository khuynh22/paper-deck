do $$
declare r record;
begin
  select * into r from merge_papers('[{"arxiv_id":"test-arxiv","doi":"10.test/paper","title":"Enriched","citations":55,"hf_upvotes":7,"venue":"Conference","abstract":"Abstract","pdf_url":"https://example.com/p.pdf","authors":["A"]}]');
  if r.outcome <> 'inserted' then raise exception 'enriched insert: %', r; end if;
  select * into r from merge_papers('[{"arxiv_id":"test-arxiv","title":"Enriched"}]');
  if r.outcome <> 'skipped' then raise exception 'partial outcome: %', r; end if;
  if not exists(select 1 from papers where arxiv_id='test-arxiv' and citations=55 and hf_upvotes=7 and venue='Conference' and abstract='Abstract' and authors=array['A']) then
    raise exception 'partial import erased metadata';
  end if;
  select * into r from merge_papers('[{"arxiv_id":"test-arxiv","title":"Enriched","citations":0,"hf_upvotes":0}]');
  if r.outcome <> 'updated' or not exists(select 1 from papers where arxiv_id='test-arxiv' and citations=0 and hf_upvotes=0) then
    raise exception 'explicit zero lost';
  end if;
  select * into r from merge_papers('[{"doi":"10.TEST/PAPER","title":"Enriched"}]');
  if r.outcome <> 'skipped' or (select count(*) from papers) <> 1 then raise exception 'DOI not idempotent'; end if;
  if (select count(*) from merge_papers('[{"doi":"10.test/paper","title":"Enriched"},{"doi":"10.test/new","title":"New"},{"doi":"10.test/bad"}]') where outcome='inserted') <> 1 then
    raise exception 'mixed batch lost unrelated row';
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
