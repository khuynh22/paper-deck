import { spawn, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { testHttp } from "./test-ingestion-http.mjs";

// This harness uses a newly created database, never the local application's DB.
const container = process.env.TEST_POSTGRES_CONTAINER || "supabase_db_paper-deck";
const database = "ingestion_test_" + randomUUID().replaceAll("-", "");
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
  sql("create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as 'select null::uuid';");
  // A fresh createdb does not inherit Supabase's per-database default table
  // grants. Mirror the service role grant before creating the app tables.
  sql("alter default privileges for role postgres in schema public grant all on tables to service_role;");
  for (const file of readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort()) {
    sql(readFileSync("supabase/migrations/" + file, "utf8"));
  }
  sql(readFileSync("tests/database/ingestion.sql", "utf8"));
  const audit = sql(readFileSync("scripts/audit-ingestion.sql", "utf8"));
  if (!audit.includes("10.test/ambiguous") || !audit.includes("1|1")) throw new Error("DOI audit missed the legacy duplicate fixture: " + audit);
  const first = session("ingestion_first");
  first.child.stdin.write(`begin; select * from merge_papers('[{"doi":"10.test/concurrent","title":"Concurrent","citations":12}]');\n\\echo LOCK_HELD\n`);
  await until(() => first.output().includes("LOCK_HELD"), "first import to hold the transaction lock");
  const second = session("ingestion_second");
  second.child.stdin.end(`select * from merge_papers('[{"doi":"10.test/concurrent","title":"Concurrent","hf_upvotes":9}]');\n`);
  await until(() => sql("select count(*) from pg_stat_activity where datname=current_database() and application_name='ingestion_second' and wait_event_type='Lock' and wait_event='advisory';").trim() === "1", "second import to block on the advisory lock");
  if (process.env.TEST_INGESTION_FAIL_CONCURRENT === "1") throw new Error("Injected concurrent-session failure");
  first.child.stdin.end("commit;\n");
  const settled = await Promise.allSettled([first.done, second.done]);
  const failure = settled.find(r => r.status === "rejected");
  if (failure) throw failure.reason;
  const result = sql("select count(*) from papers where doi='10.test/concurrent' and citations=12 and hf_upvotes=9;").trim();
  if (result !== "1") throw new Error("Concurrent imports lost fields or created duplicates: " + result);
  if (process.env.TEST_INGESTION_HTTP === "1") await testHttp(container, database);
  console.log("Database ingestion checks passed: preservation, zero, DOI aliases/conflicts, whitespace, date/authors, mixed outcomes, service-role writes, audit, and observed advisory-lock contention.");
} finally {
  for (const { child } of sessions) {
    if (!child.stdin.destroyed && !child.stdin.writableEnded) child.stdin.end("rollback;\n");
  }
  await Promise.allSettled(sessions.map(s => s.done));
  docker(["dropdb", "--force", "-U", "postgres", database]);
  console.log("Removed disposable database " + database);
}
