do $$
declare r record; failures text[] := '{}';
begin
  if (select count(*) from papers where lower(btrim(doi))='10.test/legacy') <> 1 then raise exception 'legacy DOI duplicates were not consolidated'; end if;
  if not exists(select 1 from papers where id='10000000-0000-0000-0000-000000000001' and arxiv_id='legacy-identity'
    and authors=array['A','B'] and citations=50 and hf_upvotes=5 and abstract='Full abstract' and venue='Conference'
    and published_at='2024-06-15T12:00:00Z') then failures:=array_append(failures,'metadata'); end if;
  if (select count(*) from stars where paper_id='10000000-0000-0000-0000-000000000001')<>2 then failures:=array_append(failures,'stars'); end if;
  if not exists(select 1 from stars where paper_id='10000000-0000-0000-0000-000000000001' and user_id='20000000-0000-0000-0000-000000000001' and created_at='2020-01-01') then failures:=array_append(failures,'star date'); end if;
  if (select count(*) from reading_progress where paper_id='10000000-0000-0000-0000-000000000001')<>1
    or not exists(select 1 from reading_progress where paper_id='10000000-0000-0000-0000-000000000001' and abs(scroll_pct-0.4)<0.000001 and abs(read_pct-0.5)<0.000001 and abs(marked_pct-0.3)<0.000001 and block_anchor='0' and marked_anchor='0' and reader_kind='html' and updated_at='2021-01-01') then failures:=array_append(failures,'progress'); end if;
  if (select count(*) from highlights where paper_id='10000000-0000-0000-0000-000000000001' and id in('30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002'))<>2
    or not exists(select 1 from highlights where id='30000000-0000-0000-0000-000000000001' and note='Keep this note') then failures:=array_append(failures,'highlights'); end if;
  if not exists(select 1 from paper_content where paper_id='10000000-0000-0000-0000-000000000001' and sanitized_html='<p data-blk="0">Hello world.</p>') then failures:=array_append(failures,'cache'); end if;
  if not exists(select 1 from paper_redirects where paper_id='10000000-0000-0000-0000-000000000002' and canonical_id='10000000-0000-0000-0000-000000000001') then failures:=array_append(failures,'old ID'); end if;
  if (select count(*) from paperdeck_ingestion_backup.paper_merges where original_id in('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002'))<>2 then failures:=array_append(failures,'backup'); end if;
  if has_schema_privilege('anon','paperdeck_ingestion_backup','usage') or has_schema_privilege('authenticated','paperdeck_ingestion_backup','usage') or has_schema_privilege('service_role','paperdeck_ingestion_backup','usage') then failures:=array_append(failures,'backup privacy'); end if;
  begin
    insert into papers(doi,title) values(' 10.TEST/Legacy ','Must fail');
    raise exception 'normalized uniqueness not enforced';
  exception when unique_violation then null; end;
  select * into r from merge_papers('[{"doi":"10.TEST/LEGACY","title":"Canonical"}]');
  if r.outcome not in('updated','skipped') or r.paper_id<>'10000000-0000-0000-0000-000000000001' then failures:=array_append(failures,'legacy retry'); end if;
  if cardinality(failures)>0 then raise exception 'identity preservation: %',failures; end if;
end $$;

begin;
set local role authenticated;
set local request.jwt.claim.sub='20000000-0000-0000-0000-000000000002';
do $$
begin
  if (select count(*) from stars where paper_id='10000000-0000-0000-0000-000000000001')<>1
    or exists(select 1 from reading_progress where paper_id='10000000-0000-0000-0000-000000000001')
    or exists(select 1 from highlights where paper_id='10000000-0000-0000-0000-000000000001') then
    raise exception 'Consolidation exposed another user state';
  end if;
  begin
    perform 1 from paperdeck_ingestion_backup.paper_merges;
    raise exception 'Private snapshot exposed';
  exception when insufficient_privilege then null; end;
  begin
    insert into paper_redirects(paper_id,canonical_id) values(gen_random_uuid(),'10000000-0000-0000-0000-000000000001');
    raise exception 'API role rewrote corpus identity';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
