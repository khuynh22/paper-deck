begin;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;
insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into papers(id,title,authors,categories,venue,published_at) values
 ('20000000-0000-4000-8000-000000000001','Diffusion interest fixture',array['Alex Kim'],array['cs.AI'],'ICLR','2026-01-01'),
 ('20000000-0000-4000-8000-000000000002','Diffusion interest fixture two',array[' alex KIM '],array['cs.AI'],'ICLR','2026-01-31 23:59:59Z'),
 ('20000000-0000-4000-8000-000000000003','Diffusion unrelated author',array['Alex Kim Jr'],array['cs.LG'],'Other','2026-02-01');
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
insert into research_interests(id,user_id,name,query_text,topic,venue,from_date,to_date) values
 ('30000000-0000-4000-8000-000000000001',auth.uid(),'Saved search','diffusion','cs.AI','iclr','2026-01-01','2026-01-31');
insert into research_interests(id,user_id,name,author_name) values ('30000000-0000-4000-8000-000000000002',auth.uid(),'Follow author','Alex Kim');
select check_interest_matches();
update interest_matches set first_matched_at='2026-02-01';
select check_interest_matches();
do $$ begin
 if (select count(*) from interest_matches)<>4 or exists(select from interest_matches where first_matched_at<>'2026-02-01') then raise exception 'Retry/refresh must preserve first match'; end if;
 if (select count(*) from interest_updates('2026-02-01'))<>2 then raise exception 'Deduplicate across interests'; end if;
 if exists(select from interest_updates('2026-02-01') where jsonb_array_length(reasons)<>2 or not is_new) then raise exception 'Reasons and initial new state'; end if;
 if exists(select from interest_updates('2026-01-31')) then raise exception 'Frozen cutoff'; end if;
 if (select paper->>'id' from interest_updates('2026-02-01',1,0))=(select paper->>'id' from interest_updates('2026-02-01',1,1)) then raise exception 'Tied pagination'; end if;
end $$;
select mark_interest_updates_seen('2026-02-01');
update interest_matches set first_matched_at='2026-02-02' where paper_id='20000000-0000-4000-8000-000000000002';
do $$ begin
 if (select count(*) from interest_updates('2026-02-03') where is_new)<>1 then raise exception 'Frozen checkpoint preserves later arrivals'; end if;
end $$;
select mark_interest_updates_seen('2026-01-01');
do $$ begin if exists(select from research_interests where last_seen_at<>'2026-02-01') then raise exception 'Checkpoint must not regress'; end if; end $$;
update research_interests set paused=true where name='Saved search';
do $$ begin if exists(select from interest_updates('2026-02-03') where jsonb_array_length(reasons)<>1) then raise exception 'Paused reason'; end if; end $$;
update research_interests set author_name='Nobody' where name='Follow author';
do $$ begin if exists(select from interest_updates('2026-02-03')) then raise exception 'Edited criteria must immediately filter old matches'; end if; end $$;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000002';
do $$ begin
 if exists(select from research_interests) or exists(select from interest_matches) or exists(select from interest_updates()) then raise exception 'Private preference/result leak'; end if;
 update research_interests set name='Hacked'; if found then raise exception 'Foreign edit'; end if;
 delete from research_interests; if found then raise exception 'Foreign delete'; end if;
 begin
  insert into interest_matches(interest_id,user_id,paper_id) values('30000000-0000-4000-8000-000000000001',auth.uid(),'20000000-0000-4000-8000-000000000003');
  raise exception 'Foreign interest linked';
 exception when foreign_key_violation then null; end;
end $$;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
insert into stars(user_id,paper_id) values(auth.uid(),'20000000-0000-4000-8000-000000000001');
insert into highlights(id,user_id,paper_id,block_anchor,start_offset,end_offset,quote) values('40000000-0000-4000-8000-000000000001',auth.uid(),'20000000-0000-4000-8000-000000000001','0',0,4,'Keep');
delete from research_interests;
do $$ begin
 if exists(select from interest_matches) or not exists(select from stars) or not exists(select from highlights) then raise exception 'Preference deletion must preserve library and notes'; end if;
end $$;
reset role;
do $$ begin if has_function_privilege('anon','check_interest_matches()','EXECUTE') or has_function_privilege('anon','interest_updates(timestamptz,integer,integer)','EXECUTE') then raise exception 'Anonymous RPC'; end if; end $$;
rollback;
