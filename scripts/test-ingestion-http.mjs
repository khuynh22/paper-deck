import { spawn, spawnSync } from "node:child_process";
import { createServer, request } from "node:http";

function command(args, options = {}) {
  const result = spawnSync("docker", args, { encoding: "utf8", ...options });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || "Docker failed");
  return result.stdout;
}

export async function testHttp(databaseContainer, database) {
  const restContainer = databaseContainer.replace(/^supabase_db_/, "supabase_rest_");
  const kongContainer = databaseContainer.replace(/^supabase_db_/, "supabase_kong_");
  const rest = JSON.parse(command(["inspect", restContainer]))[0];
  const config = Object.fromEntries(rest.Config.Env.map(value => {
    const separator = value.indexOf("=");
    return [value.slice(0, separator), value.slice(separator + 1)];
  }));
  const kong = JSON.parse(command(["inspect", kongContainer]))[0];
  const configPath = kong.Config.Env.find(value => value.startsWith("KONG_DECLARATIVE_CONFIG=")).split("=")[1];
  const consumers = command(["exec", kongContainer, "cat", configPath]);
  const key = role => {
    const tokens = consumers.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
    const value = tokens.find(token => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).role === role);
    if (!value) throw new Error(`Existing local ${role} key unavailable`);
    return value;
  };
  const uri = new URL(config.PGRST_DB_URI);
  uri.pathname = "/" + database;
  const name = "ingestion_api_" + database.slice("ingestion_test_".length);
  const network = Object.keys(rest.NetworkSettings.Networks)[0];
  const env = { ...process.env, PGRST_DB_URI: uri.href, PGRST_JWT_SECRET: config.PGRST_JWT_SECRET };
  command(["run", "--detach", "--rm", "--name", name, "--network", network, "-p", "127.0.0.1::3000", "-e", "PGRST_DB_URI", "-e", "PGRST_JWT_SECRET", "-e", "PGRST_DB_SCHEMAS=public", "-e", "PGRST_DB_ANON_ROLE=anon", rest.Config.Image], { env });
  let gateway;
  try {
    const mapping = command(["port", name, "3000/tcp"]).trim();
    if (!/^127\.0\.0\.1:\d+$/.test(mapping)) throw new Error("Unexpected test API binding");
    const url = "http://" + mapping;
    const deadline = Date.now() + 15000;
    while (true) {
      try { if ((await fetch(url)).ok) break; } catch {}
      if (Date.now() > deadline) throw new Error("Disposable PostgREST did not become ready");
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    gateway = createServer((req, res) => {
      if (!req.url?.startsWith("/rest/v1/")) { res.writeHead(404).end(); return; }
      const upstream = request(url + req.url.slice("/rest/v1".length), { method: req.method, headers: req.headers }, response => {
        res.writeHead(response.statusCode, response.headers);
        response.pipe(res);
      });
      upstream.on("error", () => res.writeHead(502).end());
      req.pipe(upstream);
    });
    await new Promise(resolve => gateway.listen(0, "127.0.0.1", resolve));
    const apiUrl = `http://127.0.0.1:${gateway.address().port}`;
    const child = spawn(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.integration.config.ts"], {
      stdio: "inherit",
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: apiUrl, NEXT_PUBLIC_SUPABASE_ANON_KEY: key("anon"), SUPABASE_SERVICE_ROLE_KEY: key("service_role") },
    });
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    if (code !== 0) throw new Error("Real HTTP ingestion integration tests failed");
  } finally {
    if (gateway) await new Promise(resolve => gateway.close(resolve));
    command(["rm", "--force", name]);
  }
}
