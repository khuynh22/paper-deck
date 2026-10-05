begin;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into papers(id,title) values ('20000000-0000-4000-8000-000000000001','PDF annotations');
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
insert into highlights(user_id,paper_id,block_anchor,start_offset,end_offset,quote,pdf_anchor) values
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','pdf:4',0,5,'Hello','{"page":4,"fingerprint":"identity","rects":[{"x":0.1,"y":0.2,"width":0.3,"height":0.1}]}'),
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','0',0,5,'Hello',null);
do $$ declare bad jsonb; begin
  foreach bad in array array['{}'::jsonb,'{"page":4,"fingerprint":"x","rects":[{}]}'::jsonb,'{"page":4,"fingerprint":"x","rects":[]}'::jsonb,'{"page":4,"fingerprint":"x","rects":[{"x":0.9,"y":0,"width":0.2,"height":0.1}]}'::jsonb] loop
    begin
      insert into highlights(user_id,paper_id,block_anchor,start_offset,end_offset,quote,pdf_anchor) values ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','pdf:4',0,5,'Hello',bad);
      raise exception 'Invalid PDF geometry accepted';
    exception when check_violation then null; end;
  end loop;
  if (select count(*) from my_notes())<>2 then raise exception 'Mixed annotations missing from notes'; end if;
end $$;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
do $$ begin
  if exists(select from highlights) or exists(select from my_notes()) then raise exception 'Annotations leaked'; end if;
  update highlights set note='stolen';if found then raise exception 'Foreign PDF edit';end if;
  delete from highlights;if found then raise exception 'Foreign PDF delete';end if;
end $$;
reset role;
rollback;
