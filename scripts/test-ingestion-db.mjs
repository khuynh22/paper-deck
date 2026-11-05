import { spawn, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { testHttp } from "./test-ingestion-http.mjs";

// This harness uses a newly created database, never the local application's DB.
const container = process.env.TEST_POSTGRES_CONTAINER || "supabase_db_paper-deck";
const database = "ingestion_test_" + randomUUID().replaceAll("-", "");
const freshDatabase = database + "_fresh";
let freshCreated = false;
function docker(args, input) {
  const r = spawnSync("docker", ["exec", "-i", container, ...args], { input, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.error?.message || "Docker failed");
  if (r.stderr.includes("merge_papers input")) process.stderr.write(r.stderr);
  return r.stdout;
}
const args = ["psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-At"];
function sql(text) { return docker(args, text); }
const sessions = [];
function session(name) {
  const child = spawn("docker", ["exec", "-i", container, ...args], { stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", data => { output += data; });
  child.stderr.on("data", data => { output += data; });
  child.stdin.on("error", () => {});
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(output) : reject(new Error(output || `psql exited ${code}`)));
  });
  done.catch(() => {});
  child.stdin.write(`set application_name = '${name}'; set statement_timeout = '15s'; set idle_in_transaction_session_timeout = '20s';\n`);
  const result = { child, done, output: () => output };
  sessions.push(result);
  return result;
}

async function until(check, description) {
  const deadline = Date.now() + 15000;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${description}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
docker(["createdb", "-U", "postgres", database]);
try {
  sql("create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to anon,authenticated;");
  // A fresh createdb does not inherit Supabase's per-database default table
  // grants. Mirror Supabase's API role grants; RLS still governs user state.
  sql("alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;");
  const migrations = readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort();
  const identityIndex = migrations.indexOf("20261026061656_enforce_unique_paper_identity.sql");
  if (identityIndex < 0) throw new Error("Corrective identity migration missing");
  docker(["createdb", "-U", "postgres", freshDatabase]);
  freshCreated = true;
  const freshSql = text => docker(["psql", "-U", "postgres", "-d", freshDatabase, "-v", "ON_ERROR_STOP=1", "-At"], text);
  freshSql("create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as 'select null::uuid'; alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;");
  for (const file of migrations) freshSql(readFileSync("supabase/migrations/" + file, "utf8"));
  freshSql(readFileSync("tests/database/ingestion.sql", "utf8"));
  if (!freshSql("set role service_role; select outcome from merge_papers('[{\"doi\":\"10.test/fresh\",\"title\":\"Fresh\"}]');").includes("inserted")) throw new Error("Fresh migration import failed");
  docker(["dropdb", "--force", "-U", "postgres", freshDatabase]);
  freshCreated = false;
  for (const file of migrations.slice(0, identityIndex)) {
    sql(readFileSync("supabase/migrations/" + file, "utf8"));
  }
  sql(readFileSync("tests/database/ingestion.sql", "utf8"));
  sql(readFileSync("tests/database/identity-ambiguous.sql", "utf8"));
  const audit = sql(readFileSync("scripts/audit-ingestion.sql", "utf8"));
  if (!audit.includes("10.test/ambiguous") || !audit.includes("1|1")) throw new Error("DOI audit missed the legacy duplicate fixture: " + audit);
  sql(readFileSync("tests/database/identity-legacy.sql", "utf8"));
  sql(readFileSync("tests/database/identity-unsafe.sql", "utf8"));
  const unsafeAudit = sql(readFileSync("scripts/audit-ingestion.sql", "utf8"));
  for (const kind of ["arxiv", "progress", "cache", "missing-cache", "pdf", "overlap", "unknown-reader"]) {
    if (!unsafeAudit.split(/\r?\n/).some(line => line.startsWith("10.test/unsafe-" + kind + "|{") && line.includes(kind))) throw new Error("Read-only preflight missed reason " + kind);
  }
  // Freeze the initially published 0009 at 5575063: an already-applied function
  // must be corrected by the new migration, without rerunning edited history.
  sql(readFileSync("tests/database/0009-original.sql", "utf8"));
  const beforeRepair = sql("select count(*) from papers;").trim();
  for (const file of [migrations[identityIndex]]) {
    const migration = readFileSync("supabase/migrations/" + file, "utf8");
    sql("create table public.identity_extra_refs(paper_id uuid references papers(id)); insert into identity_extra_refs values('10000000-0000-0000-0000-000000000002');");
    let unknownReferenceRejected = false;
    try { sql(migration); } catch (error) {
      if (!error.message.includes("Unexpected paper foreign key")) throw error;
      unknownReferenceRejected = true;
    }
    if (!unknownReferenceRejected) throw new Error("Migration ignored an unexpected paper reference");
    sql("drop table public.identity_extra_refs;");
    let rejected = false;
    try { sql(migration); } catch (error) {
      rejected = true;
      for (const kind of ["arxiv", "progress", "cache", "missing-cache", "pdf", "overlap", "unknown-reader"]) {
        if (!error.message.includes("10.test/unsafe-" + kind)) throw error;
      }
    }
    if (!rejected) throw new Error("Unsafe duplicate groups were not rejected");
    if (sql("select count(*) from papers;").trim() !== beforeRepair) throw new Error("Failed migration changed papers");
    if (sql("select to_regclass('public.paper_redirects') is null;").trim() !== "t") throw new Error("Failed migration partially committed");
    sql("delete from papers where doi like '10.test/unsafe-%';");
    sql(migration);
    sql(readFileSync("tests/database/identity-preservation.sql", "utf8"));
    sql(readFileSync("tests/database/ingestion.sql", "utf8"));
    sql(migration);
  }
  for (const file of migrations.slice(identityIndex + 1)) sql(readFileSync("supabase/migrations/" + file, "utf8"));
  const first = session("ingestion_first");
  first.child.stdin.write(`begin; select * from merge_papers('[{"doi":"10.test/concurrent","title":"Concurrent","citations":12}]');\n\\echo LOCK_HELD\n`);
  await until(() => first.output().includes("LOCK_HELD"), "first import to hold the transaction lock");
  const second = session("ingestion_second");
  second.child.stdin.end(`select * from merge_papers('[{"doi":"10.test/concurrent","title":"Concurrent","hf_upvotes":9}]');\n`);
  await until(() => sql("select count(*) from pg_stat_activity where datname=current_database() and application_name='ingestion_second' and wait_event_type='Lock' and wait_event='advisory';").trim() === "1", "second import to block on the advisory lock");
  const unrelated = session("ingestion_unrelated");
  unrelated.child.stdin.end(`set statement_timeout='2s'; select * from merge_papers('[{"doi":"10.test/unrelated","title":"Unrelated"}]');\n`);
  const unrelatedOutput = await unrelated.done;
  if (!unrelatedOutput.includes("inserted") || unrelatedOutput.includes("failed")) throw new Error("Unrelated import was serialized behind another identity: " + unrelatedOutput);
  if (process.env.TEST_INGESTION_FAIL_CONCURRENT === "1") throw new Error("Injected concurrent-session failure");
  first.child.stdin.end("commit;\n");
  const settled = await Promise.allSettled([first.done, second.done]);
  const failure = settled.find(r => r.status === "rejected");
  if (failure) throw failure.reason;
  const result = sql("select count(*) from papers where doi='10.test/concurrent' and citations=12 and hf_upvotes=9;").trim();
  if (result !== "1") throw new Error("Concurrent imports lost fields or created duplicates: " + result);
  sql("insert into papers(id,arxiv_id,doi,title) values('40000000-0000-0000-0000-000000000001','lock-a','10.test/lock-a','A'),('40000000-0000-0000-0000-000000000002','lock-b','10.test/lock-b','B');");
  const orderFirst = session("ingestion_order_first");
  orderFirst.child.stdin.write(`begin; select * from merge_papers('[{"arxiv_id":"lock-a","title":"A","citations":15},{"doi":"10.test/lock-b","title":"B","citations":16}]');\n\\echo ROWS_HELD\n`);
  await until(() => orderFirst.output().includes("ROWS_HELD"), "first opposite-order import");
  const orderSecond = session("ingestion_order_second");
  orderSecond.child.stdin.end(`select * from merge_papers('[{"arxiv_id":"lock-b","title":"B","hf_upvotes":17},{"doi":"10.test/lock-a","title":"A","hf_upvotes":18}]');\n`);
  await until(() => sql("select count(*) from pg_stat_activity where datname=current_database() and application_name='ingestion_order_second' and wait_event_type='Lock';").trim() === "1", "opposite identifiers to wait on sorted row locks");
  orderFirst.child.stdin.end("commit;\n");
  const ordered = await Promise.all([orderFirst.done, orderSecond.done]);
  if (ordered.some(out => out.includes("failed")) || sql("select count(*) from papers where (arxiv_id='lock-a' and citations=15 and hf_upvotes=18) or (arxiv_id='lock-b' and citations=16 and hf_upvotes=17);").trim() !== "2") throw new Error("Opposite-order imports failed or lost metadata");
  // A direct writer does not participate in advisory locking. The unique index
  // must arbitrate the race; ON CONFLICT then reselects and merges the winner.
  const direct = session("ingestion_direct");
  direct.child.stdin.write(`begin; insert into papers(doi,title,citations) values('10.test/direct-race','Direct',21);\n\\echo INSERT_HELD\n`);
  await until(() => direct.output().includes("INSERT_HELD"), "uncommitted direct insert");
  const retry = session("ingestion_unique_retry");
  retry.child.stdin.end(`select * from merge_papers('[{"doi":"10.test/direct-race","title":"Direct","hf_upvotes":22}]');\n`);
  await until(() => sql("select count(*) from pg_stat_activity where datname=current_database() and application_name='ingestion_unique_retry' and wait_event_type='Lock';").trim() === "1", "unique conflict to wait for direct writer");
  direct.child.stdin.end("commit;\n");
  const raced = await Promise.all([direct.done, retry.done]);
  if (!raced[1].includes("updated") || raced[1].includes("failed") || sql("select count(*) from papers where doi='10.test/direct-race' and citations=21 and hf_upvotes=22;").trim() !== "1") throw new Error("Unique-conflict reselect did not preserve the competing insert");
  if (process.env.TEST_INGESTION_HTTP === "1") await testHttp(container, database);
  console.log("Database ingestion checks passed: fresh + original-0009 upgrade, guarded cleanup/rollback/replay, all user references + private recovery snapshot, normalized uniqueness, metadata/partial outcomes, same/unrelated/opposite-order concurrency, and unique-conflict reselect.");
} finally {
  for (const { child } of sessions) {
    if (!child.stdin.destroyed && !child.stdin.writableEnded) child.stdin.end("rollback;\n");
  }
  await Promise.allSettled(sessions.map(s => s.done));
  if (freshCreated) docker(["dropdb", "--force", "-U", "postgres", freshDatabase]);
  docker(["dropdb", "--force", "-U", "postgres", database]);
  console.log("Removed disposable database " + database);
}
