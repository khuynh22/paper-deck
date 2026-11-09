-- Bounded import transactions share a lock, including absent identities.
-- Existing rows are also locked against other writers. Existing data is retained.
create index if not exists papers_doi_normalized_idx on public.papers (lower(btrim(doi)))
  where doi is not null;

create or replace function public.merge_papers(incoming jsonb)
returns table(input_index integer, paper_id uuid, outcome text)
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  item jsonb;
  candidate public.papers%rowtype;
  existing public.papers%rowtype;
  merged public.papers%rowtype;
  matches uuid[];
  dois text[];
  idx integer := 0;
begin
  if jsonb_typeof(incoming) <> 'array' or jsonb_array_length(incoming) > 100 then
    raise exception 'Expected at most 100 papers';
  end if;
  perform pg_advisory_xact_lock(74621, 46);
  for item in select value from jsonb_array_elements(incoming) loop
    input_index := idx;
    idx := idx + 1;
    paper_id := null;
    begin
      candidate := jsonb_populate_record(null::public.papers, item);
      candidate.arxiv_id := nullif(btrim(candidate.arxiv_id), '');
      candidate.doi := nullif(lower(btrim(candidate.doi)), '');
      dois := array(select distinct lower(btrim(value))
        from jsonb_array_elements_text(coalesce(item->'doi_aliases', '[]'::jsonb)) value
        where nullif(btrim(value), '') is not null);
      dois := array_append(dois, candidate.doi);
      candidate.title := nullif(btrim(candidate.title), '');
      candidate.abstract := nullif(btrim(candidate.abstract), '');
      candidate.html_url := nullif(btrim(candidate.html_url), '');
      candidate.pdf_url := nullif(btrim(candidate.pdf_url), '');
      candidate.source_url := nullif(btrim(candidate.source_url), '');
      candidate.venue := nullif(btrim(candidate.venue), '');
      candidate.authors := array(select btrim(value) from unnest(candidate.authors) value where nullif(btrim(value), '') is not null);
      candidate.categories := array(select btrim(value) from unnest(candidate.categories) value where nullif(btrim(value), '') is not null);
      if candidate.title is null then
        raise exception 'Missing title';
      end if;
      select array_agg(p.id) into matches from public.papers p
      where (candidate.arxiv_id is not null and p.arxiv_id = candidate.arxiv_id)
         or lower(btrim(p.doi)) = any(dois);
      if cardinality(matches) > 1 then
        raise exception 'Ambiguous paper identity';
      end if;
      if cardinality(matches) = 1 then
        select * into existing from public.papers where id = matches[1] for update;
        if candidate.arxiv_id is not null and existing.arxiv_id is not null
            and candidate.arxiv_id <> existing.arxiv_id then
          raise exception 'Conflicting paper identity';
        end if;
        merged := existing;
        merged.arxiv_id := coalesce(candidate.arxiv_id, existing.arxiv_id);
        merged.doi := case
          when lower(btrim(existing.doi)) like '10.48550/arxiv.%'
            and candidate.doi not like '10.48550/arxiv.%' then candidate.doi
          else coalesce(existing.doi, candidate.doi) end;
        merged.title := candidate.title;
        merged.authors := case when cardinality(candidate.authors) > 0
          and cardinality(candidate.authors) >= cardinality(existing.authors) then candidate.authors else existing.authors end;
        merged.categories := case when cardinality(candidate.categories) > 0 then candidate.categories else existing.categories end;
        merged.abstract := coalesce(candidate.abstract, existing.abstract);
        merged.html_url := coalesce(candidate.html_url, existing.html_url);
        merged.pdf_url := coalesce(candidate.pdf_url, existing.pdf_url);
        merged.source_url := coalesce(candidate.source_url, existing.source_url);
        -- Adapters encode year-only dates as January 1 at midnight UTC.
        merged.published_at := case when existing.published_at is not null
          and candidate.published_at = date_trunc('year', candidate.published_at, 'UTC')
          then existing.published_at else coalesce(candidate.published_at, existing.published_at) end;
        merged.venue := coalesce(candidate.venue, existing.venue);
        merged.hf_upvotes := coalesce(candidate.hf_upvotes, existing.hf_upvotes);
        merged.pwc_stars := coalesce(candidate.pwc_stars, existing.pwc_stars);
        merged.citations := coalesce(candidate.citations, existing.citations);
        paper_id := existing.id;
        if merged is not distinct from existing then
          outcome := 'skipped';
        else
          update public.papers set
            arxiv_id = merged.arxiv_id,
            doi = merged.doi,
            title = merged.title,
            authors = merged.authors,
            categories = merged.categories,
            abstract = merged.abstract,
            html_url = merged.html_url,
            pdf_url = merged.pdf_url,
            source_url = merged.source_url,
            published_at = merged.published_at,
            venue = merged.venue,
            hf_upvotes = merged.hf_upvotes,
            pwc_stars = merged.pwc_stars,
            citations = merged.citations,
            updated_at = now()
          where id = existing.id;
          outcome := 'updated';
        end if;
      else
        insert into public.papers (arxiv_id, doi, title, authors, categories, abstract, html_url, pdf_url, source_url, published_at, venue, hf_upvotes, pwc_stars, citations)
        values (candidate.arxiv_id, candidate.doi, candidate.title, coalesce(candidate.authors, '{}'), coalesce(candidate.categories, '{}'), candidate.abstract, candidate.html_url, candidate.pdf_url, candidate.source_url, candidate.published_at, candidate.venue, coalesce(candidate.hf_upvotes, 0), coalesce(candidate.pwc_stars, 0), coalesce(candidate.citations, 0))
        returning id into paper_id;
        outcome := 'inserted';
      end if;
    exception when others then
      raise warning 'merge_papers input % failed [%]: %', input_index, sqlstate, sqlerrm;
      paper_id := null;
      outcome := 'failed';
    end;
    return next;
  end loop;
end;
$$;
revoke all on function public.merge_papers(jsonb) from public, anon, authenticated;
grant execute on function public.merge_papers(jsonb) to service_role;
