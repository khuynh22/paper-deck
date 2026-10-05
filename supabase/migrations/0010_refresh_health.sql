create table public.refresh_runs (
  id uuid primary key default gen_random_uuid(),
  trigger_kind text not null check (trigger_kind in ('manual','cron')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','healthy','partial','failed')),
  sources jsonb not null default '[]',
  ingestion jsonb,
  error text
);
create index refresh_runs_started_idx on public.refresh_runs(started_at desc);
create table public.refresh_source_health (
  source_id text primary key,
  last_success_at timestamptz,
  last_outcome jsonb not null
);
create table public.refresh_lease (
  singleton boolean primary key default true check (singleton),
  run_id uuid references public.refresh_runs,
  expires_at timestamptz,
  last_manual_at timestamptz
);
insert into public.refresh_lease(singleton) values (true);
alter table public.refresh_runs enable row level security;
alter table public.refresh_source_health enable row level security;
alter table public.refresh_lease enable row level security;
revoke all on public.refresh_runs, public.refresh_source_health, public.refresh_lease from anon, authenticated;
grant all on public.refresh_runs, public.refresh_source_health, public.refresh_lease to service_role;

create function public.begin_refresh(kind text)
returns table(run_id uuid, reason text)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare lease public.refresh_lease%rowtype; new_id uuid;
begin
  if kind not in ('manual','cron') then raise exception 'Invalid refresh kind'; end if;
  select * into lease from public.refresh_lease where singleton for update;
  if lease.run_id is not null and lease.expires_at > now() then
    return query select null::uuid, 'busy'::text; return;
  end if;
  if lease.run_id is not null then
    update public.refresh_runs set status='failed', finished_at=now(), error='Refresh lease expired'
    where id=lease.run_id and status='running';
  end if;
  if kind='manual' and lease.last_manual_at > now() - interval '5 minutes' then
    return query select null::uuid, 'cooldown'::text; return;
  end if;
  insert into public.refresh_runs(trigger_kind) values(kind) returning id into new_id;
  update public.refresh_lease set run_id=new_id, expires_at=now()+interval '90 seconds',
    last_manual_at=case when kind='manual' then now() else last_manual_at end where singleton;
  return query select new_id, 'started'::text;
end;
$$;

create function public.finish_refresh(target uuid, final_status text, source_results jsonb, counts jsonb, failure text default null)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare lease public.refresh_lease%rowtype; source jsonb;
begin
  if final_status not in ('healthy','partial','failed') then raise exception 'Invalid final status'; end if;
  select * into lease from public.refresh_lease where singleton for update;
  if lease.run_id is distinct from target then return false; end if;
  update public.refresh_runs set status=final_status, finished_at=now(),
    sources=source_results, ingestion=counts, error=failure where id=target;
  for source in select value from jsonb_array_elements(source_results) loop
    insert into public.refresh_source_health(source_id,last_success_at,last_outcome)
    values(source->>'id',case when source->>'status'='healthy' and final_status <> 'failed' then now() end,source)
    on conflict(source_id) do update set
      last_success_at=coalesce(excluded.last_success_at,refresh_source_health.last_success_at),
      last_outcome=excluded.last_outcome;
  end loop;
  update public.refresh_lease set run_id=null, expires_at=null where singleton;
  return true;
end;
$$;
revoke all on function public.begin_refresh(text), public.finish_refresh(uuid,text,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.begin_refresh(text), public.finish_refresh(uuid,text,jsonb,jsonb,text) to service_role;
