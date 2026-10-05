-- Existing HTML rows retain their original anchors and a null PDF anchor.
alter table public.highlights add column pdf_anchor jsonb;
create function public.valid_pdf_anchor(value jsonb) returns boolean language plpgsql immutable as $$
declare rect jsonb; x numeric; y numeric; w numeric; h numeric; page_number numeric;
begin
  if value is null then return true; end if;
  if not (value ?& array['page','fingerprint','rects']) or jsonb_typeof(value)<>'object' or jsonb_typeof(value->'page')<>'number' or jsonb_typeof(value->'fingerprint')<>'string' or jsonb_typeof(value->'rects')<>'array' then return false; end if;
  page_number=(value->>'page')::numeric;
  if page_number<1 or page_number>100000 or trunc(page_number)<>page_number or length(value->>'fingerprint') not between 1 and 128 or jsonb_array_length(value->'rects') not between 1 and 100 then return false; end if;
  for rect in select * from jsonb_array_elements(value->'rects') loop
    if not (rect ?& array['x','y','width','height']) or jsonb_typeof(rect)<>'object' or jsonb_typeof(rect->'x')<>'number' or jsonb_typeof(rect->'y')<>'number' or jsonb_typeof(rect->'width')<>'number' or jsonb_typeof(rect->'height')<>'number' then return false; end if;
    x=(rect->>'x')::numeric;y=(rect->>'y')::numeric;w=(rect->>'width')::numeric;h=(rect->>'height')::numeric;
    if x<0 or y<0 or w<=0 or h<=0 or x+w>1.000001 or y+h>1.000001 then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;
alter table public.highlights add constraint highlights_pdf_anchor_valid check (
  public.valid_pdf_anchor(pdf_anchor) and (pdf_anchor is null or block_anchor='pdf:'||(pdf_anchor->>'page'))
);
