import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { trendingScore } from "../lib/corpus/score.ts";

const container = process.env.TEST_POSTGRES_CONTAINER || "supabase_db_paper-deck";
const database = "ranking_test_" + randomUUID().replaceAll("-", "");

function docker(args, input) {
  const result = spawnSync("docker", ["exec", "-i", container, ...args], { input, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || "Docker failed");
  return result.stdout;
}

function sql(input) {
  return docker(["psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-qAt"], input);
}

const asOf = "2026-06-06T00:00:00Z";
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fixtures = Array.from({ length: 45 }, (_, i) => ({
  id: id(i + 1),
  title: `Old ${i}`,
  hf_upvotes: 10 + i,
  pwc_stars: i % 4,
  published_at: "2020-01-01T00:00:00Z",
}));
fixtures.push(
  { id: id(46), title: "Fresh excluded by old pre-limit", hf_upvotes: 9, pwc_stars: 0, published_at: asOf },
  { id: id(47), title: "Future tie", hf_upvotes: 9, pwc_stars: 0, published_at: "2027-01-01T00:00:00Z" },
  { id: id(48), title: "Missing date", hf_upvotes: 9, pwc_stars: 10, published_at: null },
  { id: id(49), title: "Zero signals", hf_upvotes: 0, pwc_stars: 0, published_at: asOf },
  { id: id(50), title: "Ancient date", hf_upvotes: 9, pwc_stars: 10, published_at: "0001-01-01T00:00:00Z" },
  { id: id(51), title: "Legacy negative signals", hf_upvotes: -1, pwc_stars: -2, published_at: asOf },
  { id: id(52), title: "Unbounded date", hf_upvotes: 9, pwc_stars: 10, published_at: "infinity" },
);
const score = paper => trendingScore(paper, Date.parse(asOf));
const expected = [...fixtures]
  .sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))
  .map(paper => paper.id);

function page(role, limit, offset = 0) {
  return sql(`set role ${role}; select id from public.trending_papers('${asOf}', ${limit}, ${offset});`)
    .trim().split(/\r?\n/).filter(Boolean);
}

docker(["createdb", "-U", "postgres", database]);
try {
  sql("create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as 'select null::uuid';");
  for (const file of readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort()) {
    sql(readFileSync("supabase/migrations/" + file, "utf8"));
  }
  sql(`
    insert into papers(id, title, hf_upvotes, pwc_stars, published_at)
    select id, title, hf_upvotes, pwc_stars, published_at
    from jsonb_to_recordset('${JSON.stringify(fixtures)}'::jsonb)
      as x(id uuid, title text, hf_upvotes int, pwc_stars int, published_at timestamptz);
  `);

  const oldCandidates = sql("select id from papers order by hf_upvotes desc, pwc_stars desc limit 40;");
  assert(!oldCandidates.includes(id(46)), "Fixture must reproduce the old exclusion");
  assert(expected.slice(0, 40).includes(id(46)), "Fresh fixture must qualify under the reference policy");
  assert.deepEqual(page("anon", 40), expected.slice(0, 40));
  assert.deepEqual(page("authenticated", 100), expected, "SQL must match reference score and UUID order");
  assert.deepEqual(page("service_role", 100), expected);
  assert.deepEqual([...page("anon", 20), ...page("anon", 20, 20), ...page("anon", 20, 40)], expected);
  console.log("Trending ranking matches the reference, including frozen paging and all API roles.");

  sql(`
    truncate papers cascade;
    insert into papers(id, title, hf_upvotes, pwc_stars, published_at)
    select md5(i::text)::uuid, 'Plan fixture ' || i, i % 100, i % 500,
      '2026-06-06'::timestamptz - (i % 3650) * interval '1 day'
    from generate_series(1, 50000) i;
    analyze papers;
  `);
  const plan = sql(`
    set role anon;
    explain (analyze, buffers) select id from public.trending_papers('${asOf}', 40, 0);
  `);
  console.log("50,000-row ranking query plan\n" + plan);
} finally {
  docker(["dropdb", "-U", "postgres", database]);
}
