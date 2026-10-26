-- Only valid before the unique index: frozen legacy condition to be repaired.
insert into papers(doi,title) values('10.test/ambiguous','Legacy A'),('10.TEST/AMBIGUOUS','Legacy B');
do $$
declare r record;
begin
  select * into r from merge_papers('[{"doi":"10.test/ambiguous","title":"No destructive merge"}]');
  if r.outcome<>'failed' then raise exception 'legacy ambiguity was silently accepted'; end if;
end $$;
