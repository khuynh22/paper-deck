-- PaperDeck full-text search
-- A generated tsvector over the corpus + GIN index + a ranked search RPC.

-- `array_to_string` is only declared STABLE (an array's element output functions
-- could in theory be non-immutable), so it cannot appear directly in a
-- `generated ... stored` expression -- Postgres rejects it with "generation
-- expression is not immutable". Our arrays are text[] (genuinely immutable to
-- stringify), so we build the whole vector inside a function we declare IMMUTABLE
-- and reference that from the generated column. Postgres trusts the declaration.
create or replace function papers_search_vector(
  title text,
  authors text[],
  abstract text,
  categories text[]
)
returns tsvector
language sql
immutable
as $$
  select
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(array_to_string(authors, ' '), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(abstract, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(categories, ' '), '')), 'D')
$$;

-- Weighted search vector: title (A) > authors (B) > abstract (C) > categories (D).
-- `generated ... stored` means Postgres maintains it on every insert/update, so the
-- existing upsert path needs no changes and existing rows index on migrate.
alter table papers add column if not exists search_vector tsvector
  generated always as (papers_search_vector(title, authors, abstract, categories)) stored;

create index if not exists papers_search_idx on papers using gin (search_vector);

-- Ranked corpus search. supabase-js .order() cannot order by a ts_rank() expression,
-- so ranking lives in this function, invoked via .rpc('search_papers', { q, lim }).
-- SECURITY INVOKER (default) keeps the caller's RLS; `papers` is world-readable.
create or replace function search_papers(q text, lim int default 40)
returns setof papers
language sql
stable
as $$
  select *
  from papers
  where search_vector @@ websearch_to_tsquery('english', q)
  order by ts_rank(search_vector, websearch_to_tsquery('english', q)) desc,
           published_at desc nulls last
  limit lim;
$$;
