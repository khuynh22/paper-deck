import { readFileSync, cpSync, existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
const env = JSON.parse(readFileSync(".e2e/env.json", "utf8"));
const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
if (url.port !== "55421" || !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Expected isolated test database");
const testEnv = { ...process.env, ...env, NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3102" };
const build = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], { env: testEnv, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true });
const child = spawn(process.execPath, [".next/standalone/server.js"], {
  env: { ...testEnv, HOSTNAME: "127.0.0.1", PORT: "3102" }, stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", code => process.exit(code ?? 1));
