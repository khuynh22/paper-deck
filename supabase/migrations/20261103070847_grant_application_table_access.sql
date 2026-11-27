grant usage on schema public to anon, authenticated, service_role;

grant select on table public.papers, public.paper_content to anon, authenticated;

grant select, insert, update, delete on table
  public.stars, public.reading_progress, public.highlights
  to authenticated;

grant select, insert, update on table public.papers, public.paper_content to service_role;
