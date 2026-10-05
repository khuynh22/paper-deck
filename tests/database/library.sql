begin;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into papers(id,title) select ('20000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'Library fixture' from generate_series(1,55)i;
insert into stars(user_id,paper_id,created_at) select '10000000-0000-4000-8000-000000000001',id,'2026-01-01' from papers where title='Library fixture';
insert into reading_progress(user_id,paper_id,status,scroll_pct,block_anchor,marked_pct) values ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','done',0.5,'8',0.4);
insert into collections(id,user_id,name) values ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Private');
insert into collection_papers(user_id,collection_id,paper_id) values ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
do $$ declare first_ids uuid[]; next_ids uuid[]; begin
  if (select count(*) from library_papers(query_text=>'library',status_filter=>'to_read',page_limit=>100))<>54 then raise exception 'No-progress status mapping'; end if;
  if (select count(*) from library_papers(status_filter=>'done'))<>1 then raise exception 'Explicit completion'; end if;
  select array_agg((paper->>'id')::uuid) into first_ids from library_papers(query_text=>'library',status_filter=>'to_read',sort_mode=>'title',page_limit=>40);
  select array_agg((paper->>'id')::uuid) into next_ids from library_papers(query_text=>'library',status_filter=>'to_read',sort_mode=>'title',page_limit=>40,page_offset=>40);
  if cardinality(first_ids)<>40 or cardinality(next_ids)<>14 or first_ids&&next_ids then raise exception 'Library paging'; end if;
  if (select count(*) from library_papers(selected_collection=>'30000000-0000-4000-8000-000000000001'))<>1 then raise exception 'Collection filter'; end if;
end $$;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
do $$ begin
  if exists(select from collections) or exists(select from collection_papers) or exists(select from library_papers()) then raise exception 'Private collection/library leaked'; end if;
  update collections set name='stolen' where id='30000000-0000-4000-8000-000000000001';
  if found then raise exception 'Foreign rename'; end if;
  delete from collections where id='30000000-0000-4000-8000-000000000001';
  if found then raise exception 'Foreign delete'; end if;
  begin
    insert into collection_papers(user_id,collection_id,paper_id) values ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002');
    raise exception 'Foreign membership accepted';
  exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
delete from collections where id='30000000-0000-4000-8000-000000000001';
do $$ begin
  if (select count(*) from stars)<>55 or (select count(*) from reading_progress)<>1 then raise exception 'Collection deletion damaged saved state'; end if;
end $$;
reset role;
rollback;
