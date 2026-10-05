import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { trendingScore } from "../lib/corpus/score.ts";

const container = process.env.TEST_POSTGRES_CONTAINER || "supabase_db_paper-deck";
const database = "ranking_test_" + randomUUID().replaceAll("-", "");
function docker(args, input) {
  const result = spawnSync("docker", ["exec", "-i", container, ...args], { input, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || "Docker failed");
  return result.stdout;
}
function sql(input) { return docker(["psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-At"], input); }
const asOf = "2026-06-06T00:00:00Z";
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fixtures = Array.from({ length: 45 }, (_, i) => ({ id: id(i + 1), title: `Old ${i}`, hf_upvotes: 10 + i, pwc_stars: i % 4, published_at: "2020-01-01T00:00:00Z" }));
fixtures.push(
  { id: id(46), title: "Fresh excluded by old pre-limit", hf_upvotes: 9, pwc_stars: 0, published_at: asOf },
  { id: id(47), title: "Future tie", hf_upvotes: 9, pwc_stars: 0, published_at: "2027-01-01T00:00:00Z" },
  { id: id(48), title: "Missing date", hf_upvotes: 9, pwc_stars: 10, published_at: null },
  { id: id(49), title: "Zero signals", hf_upvotes: 0, pwc_stars: 0, published_at: asOf },
  { id: id(50), title: "Ancient date", hf_upvotes: 9, pwc_stars: 10, published_at: "0001-01-01T00:00:00Z" },
);
const expected = [...fixtures].sort((a, b) => trendingScore(b, Date.parse(asOf)) - trendingScore(a, Date.parse(asOf)) || a.id.localeCompare(b.id)).map(p => p.id);
const oldCandidates = [...fixtures].sort((a, b) => b.hf_upvotes - a.hf_upvotes || b.pwc_stars - a.pwc_stars).slice(0, 40);
assert(!oldCandidates.some(p => p.id === id(46)), "Regression fixture must reproduce old exclusion");
assert(expected.slice(0, 40).includes(id(46)), "Fresh fixture must qualify under the reference policy");

docker(["createdb", "-U", "postgres", database]);
try {
  sql("create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as 'select null::uuid';");
  for (const file of readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort()) sql(readFileSync("supabase/migrations/" + file, "utf8"));
  sql(`insert into papers(id,title,hf_upvotes,pwc_stars,published_at) select id,title,hf_upvotes,pwc_stars,published_at from jsonb_to_recordset('${JSON.stringify(fixtures)}'::jsonb) as x(id uuid,title text,hf_upvotes int,pwc_stars int,published_at timestamptz);`);
  const page = (limit, offset = 0) => sql(`select id from trending_papers('${asOf}',${limit},${offset});`).trim().split("\n").filter(Boolean);
  assert.deepEqual(page(100), expected, "SQL must match reference scores and UUID tie order across the complete corpus");
  assert.deepEqual(page(40), expected.slice(0, 40));
  assert.deepEqual([...page(20), ...page(20, 20), ...page(20, 40)], expected, "Frozen pages must have no gaps or duplicates");
  assert.equal(sql("select has_function_privilege('anon', 'trending_papers(timestamptz,integer,integer)', 'EXECUTE');").trim(), "t");
  sql(readFileSync("tests/database/discovery.sql", "utf8"));
  sql(readFileSync("tests/database/library.sql", "utf8"));
  sql("truncate papers cascade; insert into papers(id,title,hf_upvotes,pwc_stars,published_at) select md5(i::text)::uuid,'Plan fixture '||i,i%100,i%500,'2026-06-06'::timestamptz - (i%3650)*interval '1 day' from generate_series(1,50000) i; analyze papers;");
  const plan = sql(`explain (analyze, buffers, format json) select * from trending_papers('${asOf}',40,0);`);
  console.log("50,000-row actual RPC plan:\n" + plan);
  sql("update papers p set categories=case when i%100=0 then array['cs.AI'] else array['cs.LG'] end, venue=case when i%100=0 then 'TargetConf' else 'OtherConf' end from generate_series(1,50000) i where p.id=md5(i::text)::uuid; analyze papers;");
  function filterPlan(label, filter) {
    const result = JSON.parse(sql(`explain (analyze,buffers,format json) select * from discover_papers(${filter});`))[0];
    const nodes = [];
    function walk(node) { nodes.push({ type: node["Node Type"], index: node["Index Name"] }); for (const child of node.Plans || []) walk(child); }
    walk(result.Plan);
    console.log(JSON.stringify({ label, milliseconds: result["Execution Time"], buffers: result.Plan["Shared Hit Blocks"], nodes }));
  }
  // Only this newly created disposable database is modified for comparison.
  sql("drop index if exists papers_venue_lower_idx;");
  filterPlan("topic before indexes", "filter_topic=>'cs.AI'");
  filterPlan("venue before indexes", "filter_venue=>'targetconf'");
  sql("create index if not exists papers_categories_idx on papers using gin(categories); create index if not exists papers_venue_lower_idx on papers(lower(venue)); analyze papers;");
  filterPlan("topic with index", "filter_topic=>'cs.AI'");
  filterPlan("venue with index", "filter_venue=>'targetconf'");
  console.log("Discovery database checks passed: independent/combined filters, tied ordering, >40 pagination in all modes, date boundaries, exact IDs, empty selections.");
  console.log("Ranking database checks passed: pre-limit regression, reference parity, future/null/ancient dates, zero signals, ties, frozen paging, public access.");
} finally { docker(["dropdb", "-U", "postgres", database]); }
