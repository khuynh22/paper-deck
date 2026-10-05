begin;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into papers(id,title) values ('20000000-0000-4000-8000-000000000001','Notes title fixture'),('20000000-0000-4000-8000-000000000002','Other paper');
insert into highlights(id,user_id,paper_id,block_anchor,start_offset,end_offset,quote,note,updated_at)
select ('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','0',0,7,'Literal 100% quote','Research idea','2026-01-01' from generate_series(1,55)i;
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
do $$ declare first_ids uuid[]; next_ids uuid[]; begin
  if (select count(*) from my_notes(query_text=>'100%',page_limit=>100))<>55 then raise exception 'Quote search'; end if;
  if (select count(*) from my_notes(query_text=>'RESEARCH',page_limit=>100))<>55 then raise exception 'Note search'; end if;
  if (select count(*) from my_notes(query_text=>'title fixture',page_limit=>100))<>55 then raise exception 'Title search'; end if;
  if exists(select from my_notes(query_text=>'missing')) or exists(select from my_notes(selected_paper=>'20000000-0000-4000-8000-000000000002')) then raise exception 'Filters'; end if;
  select array_agg(id) into first_ids from my_notes(page_limit=>40);
  select array_agg(id) into next_ids from my_notes(page_limit=>40,page_offset=>40);
  if cardinality(first_ids)<>40 or cardinality(next_ids)<>15 or first_ids&&next_ids or first_ids[1]<>'30000000-0000-4000-8000-000000000001' then raise exception 'Deterministic paging'; end if;
  if (select count(*) from my_note_papers())<>1 then raise exception 'Private paper filter'; end if;
end $$;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
do $$ begin
  if exists(select from my_notes()) or exists(select from my_note_papers()) then raise exception 'Private notes leaked'; end if;
end $$;
reset role;
do $$ begin
  if has_function_privilege('anon','my_notes(text,uuid,integer,integer)','EXECUTE') or has_function_privilege('anon','my_note_papers()','EXECUTE') then raise exception 'Anonymous RPC access'; end if;
end $$;
rollback;
