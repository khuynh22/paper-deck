import { test as base, expect, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const config = JSON.parse(readFileSync(".e2e/env.json", "utf8"));
const url = new URL(config.NEXT_PUBLIC_SUPABASE_URL);
if (!["localhost","127.0.0.1"].includes(url.hostname) || url.port !== "55421") throw new Error("E2E requires isolated localhost Supabase");
export const admin = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
export async function authenticate(context: BrowserContext, email: string, password: string) {
  const cookies: { name: string; value: string }[] = [];
  const client = createServerClient(config.NEXT_PUBLIC_SUPABASE_URL, config.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookies, setAll: values => { cookies.push(...values); } },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await context.addCookies(cookies.map(({ name, value }) => ({ name, value, domain: "127.0.0.1", path: "/", sameSite: "Lax" as const })));
  return client;
}

type Seed = { userId: string; email: string; password: string; htmlId: string; pdfId: string; title: string };
export const test = base.extend<{ seed: Seed }>({
  seed: async ({ context }, provide) => {
    const id = randomUUID();
    const email = `reader-${id}@example.test`;
    const password = randomUUID() + "Aa1!";
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error || new Error("User not created");
    const htmlId = randomUUID(), pdfId = randomUUID();
    const title = "Browser persistence " + id;
    try {
      const inserted = await admin.from("papers").insert([
        { id: htmlId, title, authors: ["Test Author"], categories: ["cs.AI"], abstract: "Deterministic browser fixture", published_at: "2026-01-01T00:00:00Z" },
        { id: pdfId, title: "PDF fixture " + id, authors: ["Test Author"], categories: [], pdf_url: "https://example.invalid/fixture.pdf" },
      ]);
      if (inserted.error) throw inserted.error;
      const html = Array.from({ length: 30 }, (_, i) => `<p data-blk="${i}">Passage ${i}: reliable reading preserves this research note. ${"Fixture text for scrolling and restoration. ".repeat(14)}</p>`).join("");
      const cached = await admin.from("paper_content").insert({ paper_id: htmlId, kind: "html", sanitized_html: html });
      if (cached.error) throw cached.error;
      await authenticate(context, email, password);
      await provide({ userId: created.data.user.id, email, password, htmlId, pdfId, title });
    } finally {
      await admin.from("papers").delete().in("id", [htmlId, pdfId]);
      await admin.auth.admin.deleteUser(created.data.user.id);
    }
  },
});
export { expect };
