-- Rename this branch's read_max_pct -> marked_pct. It now holds the button-set
-- read boundary (0–1 of content height; 0 = unmarked), not an auto scroll max.
-- read_max_pct exists only on this branch, so the rename loses no real data.
-- Idempotent so re-application is safe.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'reading_progress' and column_name = 'read_max_pct')
     and not exists (select 1 from information_schema.columns
                     where table_name = 'reading_progress' and column_name = 'marked_pct')
  then
    alter table reading_progress rename column read_max_pct to marked_pct;
  end if;
end $$;
