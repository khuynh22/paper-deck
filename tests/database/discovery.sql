begin;
truncate papers cascade;
insert into papers(id,title,abstract,categories,venue,published_at,hf_upvotes,pwc_stars,citations,arxiv_id)
select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
  'Discovery fixture', 'Research',
  case when i<=80 then array['cs.AI'] else array['cs.LG'] end,
  case when i<=65 then 'TestConf' else 'OtherConf' end,
  case when i<=60 then '2026-01-15T23:59:59Z'::timestamptz else '2025-01-01'::timestamptz end,
  10,10,10,case when i=1 then '2401.12345' end
from generate_series(1,100) i;
do $$
declare mode text; full_ids uuid[]; paged_ids uuid[]; expected uuid[];
begin
  select array_agg(id order by id) into expected from papers where published_at>'2026-01-01';
  foreach mode in array array['latest','trending','famous','search'] loop
    select array_agg(id) into full_ids from discover_papers('discovery',mode,'cs.AI','testconf','2026-01-01','2026-01-15',null,'2026-06-06',100,0);
    if full_ids is distinct from expected then raise exception 'Combined filter/order mismatch for %',mode; end if;
    select array_agg(id) into paged_ids from (
      select * from discover_papers('discovery',mode,'cs.AI','testconf','2026-01-01','2026-01-15',null,'2026-06-06',40,0)
      union all select * from discover_papers('discovery',mode,'cs.AI','testconf','2026-01-01','2026-01-15',null,'2026-06-06',40,40)
    ) pages;
    if paged_ids is distinct from expected then raise exception 'Paging gap/duplicate for %',mode; end if;
  end loop;
  if (select count(*) from discover_papers(filter_topic=>'cs.AI',page_limit=>100))<>80 then raise exception 'Topic filter'; end if;
  if (select count(*) from discover_papers(filter_venue=>'TESTCONF',page_limit=>100))<>65 then raise exception 'Venue filter'; end if;
  if (select count(*) from discover_papers(filter_from=>'2026-01-01',page_limit=>100))<>60 then raise exception 'Date filter'; end if;
  if exists(select from discover_papers(filter_topic=>'missing')) then raise exception 'Empty selection'; end if;
  if (select count(*) from discover_papers(query_text=>'https://arxiv.org/abs/2401.12345',exact_arxiv=>'2401.12345',filter_topic=>'cs.AI'))<>1 then raise exception 'Exact ID query'; end if;
  if exists(select from discover_papers(exact_arxiv=>'2401.12345',filter_topic=>'cs.LG')) then raise exception 'Exact ID ignored filters'; end if;
end $$;
insert into papers(title,abstract,categories) values ('Other subject','discovery',array['rank.fixture']),('Discovery','Other subject',array['rank.fixture']);
do $$ begin
  if (select title from discover_papers(query_text=>'discovery',sort_mode=>'search',filter_topic=>'rank.fixture',page_limit=>1))<>'Discovery' then raise exception 'Search relevance weight changed'; end if;
end $$;
rollback;
