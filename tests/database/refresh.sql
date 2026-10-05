do $$
declare claim record; again record; final boolean;
begin
  select * into claim from begin_refresh('manual');
  if claim.reason <> 'started' or claim.run_id is null then raise exception 'claim failed'; end if;
  select * into again from begin_refresh('cron');
  if again.reason <> 'busy' then raise exception 'overlap accepted'; end if;
  final := finish_refresh(claim.run_id, 'healthy', '[{"id":"arxiv","status":"healthy","count":0}]','{"inserted":0}',null);
  if not final or not exists(select 1 from refresh_source_health where source_id='arxiv' and last_success_at is not null) then raise exception 'success health missing'; end if;
  select * into again from begin_refresh('manual');
  if again.reason <> 'cooldown' then raise exception 'cooldown missing'; end if;
  select * into claim from begin_refresh('cron');
  if claim.reason <> 'started' then raise exception 'cron incorrectly blocked by manual cooldown'; end if;
  final := finish_refresh(claim.run_id, 'failed', '[{"id":"arxiv","status":"failed","count":0}]','{}','Source failed');
  if not exists(select 1 from refresh_source_health where source_id='arxiv' and last_success_at is not null) then raise exception 'failure erased success history'; end if;
  select * into claim from begin_refresh('cron');
  update refresh_lease set expires_at=now()-interval '1 second';
  select * into again from begin_refresh('cron');
  if again.reason <> 'started' or not exists(select 1 from refresh_runs where id=claim.run_id and status='failed') then raise exception 'expired lease not recovered'; end if;
  if finish_refresh(claim.run_id,'healthy','[]','{}',null) then raise exception 'stale writer finished new run'; end if;
  perform finish_refresh(again.run_id,'healthy','[]','{}',null);
  if has_function_privilege('anon','public.begin_refresh(text)','execute')
    or has_function_privilege('authenticated','public.finish_refresh(uuid,text,jsonb,jsonb,text)','execute')
    or has_table_privilege('authenticated','public.refresh_runs','select') then
    raise exception 'operational data exposed';
  end if;
end;
$$;
