import { spawn, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";

// This harness uses a newly created database, never the local application's DB.
const container = process.env.TEST_POSTGRES_CONTAINER || "supabase_db_paper-deck";
const database = "ingestion_test_" + randomUUID().replaceAll("-", "");
function docker(args, input) {
  const r = spawnSync("docker", ["exec", "-i", container, ...args], { input, encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr || r.error?.message || "Docker failed");
  return r.stdout;
}
const args = ["psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-At"];
function sql(text) { return docker(args, text); }
function concurrent(text) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", container, ...args], { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", data => { output += data; });
    child.stderr.on("data", data => { output += data; });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(output) : reject(new Error(output)));
    child.stdin.end(text);
  });
}
docker(["createdb", "-U", "postgres", database]);
try {
  sql("create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as 'select null::uuid';");
  for (const file of readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort()) {
    sql(readFileSync("supabase/migrations/" + file, "utf8"));
  }
  sql(readFileSync("tests/database/ingestion.sql", "utf8"));
  // Independent connections contend for the same previously absent identity.
  await Promise.all([
    concurrent(`begin; select * from merge_papers('[{"doi":"10.test/concurrent","title":"Concurrent","citations":12}]'); select pg_sleep(0.3); commit;`),
    concurrent(`select * from merge_papers('[{"doi":"10.test/concurrent","title":"Concurrent","hf_upvotes":9}]');`),
  ]);
  const result = sql("select count(*) from papers where doi='10.test/concurrent' and citations=12 and hf_upvotes=9;").trim();
  if (result !== "1") throw new Error("Concurrent imports lost fields or created duplicates: " + result);
  console.log("Database ingestion checks passed: preservation, zero, DOI, mixed failures, permissions, concurrent imports.");
} finally {
  docker(["dropdb", "-U", "postgres", database]);
}
