import { test, expect, admin } from "./fixtures";
import { randomUUID } from "node:crypto";

test("trending includes a fresh paper outside the raw-attention top forty", async ({ page, seed }) => {
  const old = Array.from({ length: 45 }, (_, i) => ({ id: randomUUID(), title: `Old ranking fixture ${i}`, hf_upvotes: 10, published_at: "2000-01-01T00:00:00Z" }));
  try {
    expect((await admin.from("papers").insert(old)).error).toBeNull();
    expect((await admin.from("papers").update({ hf_upvotes: 9, published_at: new Date().toISOString() }).eq("id", seed.htmlId)).error).toBeNull();
    await page.goto("/?tab=trending");
    await expect(page.getByRole("link", { name: seed.title, exact: true })).toBeVisible();
  } finally { await admin.from("papers").delete().in("id", old.map(p => p.id)); }
});
