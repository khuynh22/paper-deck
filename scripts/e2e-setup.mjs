import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
const cli = process.platform === "win32" ? "npm.cmd" : "npm";
function supabase(args) {
  const result = spawnSync(cli, ["exec", "--yes", "--package=supabase@2.119.0", "--", "supabase", ...args, "--workdir", "tests/e2e"], { encoding: "utf8", shell: process.platform === "win32" });
  if (result.status !== 0) {
    mkdirSync(".e2e", { recursive: true });
    writeFileSync(".e2e/setup-error.log", result.stderr + result.stdout);
    throw new Error("Local test Supabase setup failed; inspect .e2e/setup-error.log (may contain local test keys).");
  }
  return result.stdout;
}
mkdirSync("tests/e2e/supabase/migrations", { recursive: true });
cpSync("supabase/migrations", "tests/e2e/supabase/migrations", { recursive: true });
supabase(["start", "--exclude", "realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor"]);
supabase(["db", "reset", "--local", "--yes"]);
const status = JSON.parse(supabase(["status", "-o", "json"]));
if (new URL(status.API_URL).port !== "55421" || !["localhost","127.0.0.1"].includes(new URL(status.API_URL).hostname)) throw new Error("Refusing non-test Supabase URL");
mkdirSync(".e2e", { recursive: true });
writeFileSync(".e2e/env.json", JSON.stringify({
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
}));
console.log("Isolated paper-deck-e2e database is ready on port 55421.");
