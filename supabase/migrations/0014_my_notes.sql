create index highlights_owner_updated_idx on public.highlights(user_id,updated_at desc,id);
create or replace function public.my_notes(query_text text default '', selected_paper uuid default null,page_limit integer default 41,page_offset integer default 0)
returns table(id uuid,paper_id uuid,paper_title text,quote text,note text,updated_at timestamptz,block_anchor text,start_offset integer,end_offset integer)
language sql stable security invoker as $$
  select h.id,h.paper_id,p.title,h.quote,h.note,h.updated_at,h.block_anchor,h.start_offset,h.end_offset
  from public.highlights h join public.papers p on p.id=h.paper_id
  where h.user_id=(select auth.uid())
    and (selected_paper is null or h.paper_id=selected_paper)
    and (nullif(btrim(query_text),'') is null or strpos(lower(h.quote||' '||coalesce(h.note,'')||' '||p.title),lower(btrim(query_text)))>0)
  order by h.updated_at desc,h.id asc
  limit greatest(1,least(coalesce(page_limit,41),100)) offset greatest(0,least(coalesce(page_offset,0),100000));
$$;
create or replace function public.my_note_papers()
returns table(id uuid,title text) language sql stable security invoker as $$
  select p.id,p.title from public.papers p
  where exists(select 1 from public.highlights h where h.paper_id=p.id and h.user_id=(select auth.uid()));
$$;
revoke all on function public.my_notes(text,uuid,integer,integer),public.my_note_papers() from public,anon;
grant execute on function public.my_notes(text,uuid,integer,integer),public.my_note_papers() to authenticated,service_role;
