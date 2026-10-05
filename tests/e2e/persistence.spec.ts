import { test, expect, admin, authenticate } from "./fixtures";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pdfFixture } from "./pdf";

test("library, HTML marks and notes survive reload and another session; failed saves retry", async ({ page, context, browser, seed }) => {
  await page.goto(`/paper/${seed.htmlId}`);
  await page.getByRole("button", { name: "Save to library", exact: true }).click();
  await expect.poll(async () => (await admin.from("stars").select("paper_id").eq("user_id", seed.userId)).data?.length).toBe(1);
  await page.goto("/library");
  await expect(page.getByRole("link", { name: seed.title, exact: true })).toBeVisible();
  await page.goto(`/reader/${seed.htmlId}`);
  await expect(page.locator(".paper-html [data-blk]")).toHaveCount(30);
  await page.getByRole("button", { name: "I finished here" }).click();
  await expect.poll(async () => (await admin.from("reading_progress").select("marked_pct").eq("user_id", seed.userId).single()).data?.marked_pct ?? 0).toBeGreaterThan(0);
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();

  // Commit the highlight, but lose its response. Retrying must reuse its identity.
  let lost = false;
  await context.route(`**/reader/${seed.htmlId}`, async route => {
    if (!lost && route.request().method() === "POST" && route.request().postData()?.includes("quote")) {
      lost = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.locator('.paper-html [data-blk="0"]').evaluate(block => {
    const range = document.createRange();
    range.setStart(block.firstChild!, 0); range.setEnd(block.firstChild!, 30);
    const selection = window.getSelection()!;
    selection.removeAllRanges(); selection.addRange(range);
    block.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  expect(lost).toBe(true);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator("mark.pd-highlight")).toHaveCount(1);
  await page.locator("mark.pd-highlight").click();
  await page.getByRole("textbox", { name: "Note", exact: true }).fill("Private persistent research note");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Note", exact: true })).toHaveCount(0);
  await expect.poll(async () => (await admin.from("highlights").select("note").eq("user_id", seed.userId)).data).toEqual([{ note: "Private persistent research note" }]);
  await page.reload();
  await expect(page.getByTestId("read-mark")).toBeVisible();
  await expect(page.locator("mark.pd-highlight")).toHaveCount(1);
  const second = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  try {
    await authenticate(second, seed.email, seed.password);
    const other = await second.newPage();
    await other.goto(`http://127.0.0.1:3102/reader/${seed.htmlId}`);
    await expect(other.getByTestId("read-mark")).toBeVisible();
    await other.locator("mark.pd-highlight").click();
    await expect(other.getByRole("textbox", { name: "Note", exact: true })).toHaveValue("Private persistent research note");
    await other.getByRole("button", { name: "Cancel", exact: true }).click();
    await other.goto(`http://127.0.0.1:3102/paper/${seed.htmlId}`);
    await other.getByRole("button", { name: "Remove from library", exact: true }).click();
    await expect.poll(async () => (await admin.from("stars").select("paper_id").eq("user_id", seed.userId)).data).toEqual([]);
    await other.goto("http://127.0.0.1:3102/library");
    await expect(other.getByRole("link", { name: seed.title, exact: true })).toHaveCount(0);
  } finally { await second.close(); }
});

test("PDF fallback renders and restores its saved marker", async ({ page, context, seed }) => {
  const require = createRequire(join(process.cwd(), "package.json"));
  const pdfRequire = createRequire(require.resolve("react-pdf"));
  const worker = join(dirname(pdfRequire.resolve("pdfjs-dist/package.json")), "build/pdf.worker.min.mjs");
  await context.route("https://unpkg.com/pdfjs-dist@*/build/pdf.worker.min.mjs", route => route.fulfill({ path: worker, contentType: "application/javascript", headers: { "access-control-allow-origin": "*" } }));
  await context.route(`**/api/reader/${seed.pdfId}?pdf=1`, route => route.fulfill({ body: pdfFixture(), contentType: "application/pdf" }));
  await page.goto(`/reader/${seed.pdfId}`);
  await expect(page.locator("[data-page] canvas")).toHaveCount(2);
  await page.getByRole("button", { name: "I finished here" }).click();
  await expect.poll(async () => (await admin.from("reading_progress").select("reader_kind,marked_anchor").eq("user_id", seed.userId).single()).data).toEqual({ reader_kind: "pdf", marked_anchor: "1" });
  await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-page="1"]').getByText("read", { exact: true })).toBeVisible();
});

test("another user cannot read or mutate private library, progress or notes", async ({ page, browser, seed }) => {
  const highlight = { id: randomUUID(), user_id: seed.userId, paper_id: seed.htmlId, block_anchor: "0", start_offset: 0, end_offset: 7, quote: "Passage", note: "Secret note" };
  for (const [table, row] of [["stars", { user_id: seed.userId, paper_id: seed.htmlId }], ["reading_progress", { user_id: seed.userId, paper_id: seed.htmlId, marked_pct: 0.5 }], ["highlights", highlight]] as [string, Record<string, unknown>][]) {
    const { error } = await admin.from(table).insert(row); expect(error).toBeNull();
  }
  const email = `other-${randomUUID()}@example.test`, password = randomUUID() + "Aa1!";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  const second = await browser.newContext({ viewport: page.viewportSize() ?? undefined });
  try {
    const client = await authenticate(second, email, password);
    for (const table of ["stars", "reading_progress", "highlights"]) {
      const read = await client.from(table).select("*").eq("user_id", seed.userId);
      expect(read.error).toBeNull(); expect(read.data).toEqual([]);
      const removed = await client.from(table).delete().eq("user_id", seed.userId).select();
      expect(removed.error).toBeNull(); expect(removed.data).toEqual([]);
      expect((await admin.from(table).select("*").eq("user_id", seed.userId)).data).toHaveLength(1);
    }
    const changed = await client.from("highlights").update({ note: "stolen" }).eq("id", highlight.id).select();
    expect(changed.data).toEqual([]);
    expect((await client.from("stars").insert({ user_id: seed.userId, paper_id: seed.pdfId })).error).not.toBeNull();
    const other = await second.newPage();
    await other.goto("http://127.0.0.1:3102/library");
    await expect(other.getByRole("link", { name: seed.title, exact: true })).toHaveCount(0);
    await other.goto(`http://127.0.0.1:3102/reader/${seed.htmlId}`);
    await expect(other.locator(".paper-html [data-blk]")).toHaveCount(30);
    await expect(other.locator("mark.pd-highlight")).toHaveCount(0);
    await expect(other.getByTestId("read-mark")).toHaveCount(0);
  } finally { await second.close(); await admin.auth.admin.deleteUser(created.data.user!.id); }
});

test("anonymous reader and invalid callback return to sign-in", async ({ page }) => {
  await page.goto(`/reader/${randomUUID()}`);
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/auth/callback?code=invalid&next=/library");
  await expect(page).toHaveURL(/\/login\?error=auth/);
});
