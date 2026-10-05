import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

process.loadEnvFile(join(process.cwd(), ".env.local"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const baseUrl = process.env.READER_SAVE_BASE_URL ?? "http://localhost:3000";
assert(["localhost", "127.0.0.1"].includes(new URL(supabaseUrl).hostname));
assert(["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname));

const db = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);
const email = `save-check-${randomUUID()}@example.test`;
const password = randomUUID();
const paperId = randomUUID();
const actionRoute = `**/reader/${paperId}`;
let userId;
let browser;

function check(result) {
  if (!result) throw new Error("No result returned");
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

function errorMessage(error) {
  return (error instanceof Error ? error.message : String(error)).split("Call log:")[0].trim();
}

async function selectText(page, block, start, end) {
  await page.evaluate(({ block, start, end }) => {
    const paragraph = document.querySelector(`[data-blk="${block}"]`);
    if (!paragraph?.firstChild) throw new Error(`Missing text in block ${block}`);
    const range = document.createRange();
    range.setStart(paragraph.firstChild, start);
    range.setEnd(paragraph.firstChild, end);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  }, { block, start, end });
}

async function failNextAction(page, { commit = false, delayMs = 0 } = {}) {
  let intercepted = false;
  const handler = async (route) => {
    if (intercepted || route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    intercepted = true;
    try {
      if (commit) await route.fetch();
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    } finally {
      await route.abort("failed").catch(() => {});
    }
  };
  await page.route(actionRoute, handler);
  return () => page.unroute(actionRoute, handler);
}

async function verify() {
  userId = check(await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })).user.id;
  check(await db.from("papers").insert({
    id: paperId,
    title: "Reader save verification",
    authors: ["Local test"],
    categories: [],
  }));
  const html = Array.from({ length: 35 }, (_, index) => {
    const intro = index === 0 ? "Diffusion models are great. " : "";
    return `<p data-blk="${index}">${intro}Local verification paragraph ${index}. This fixture checks reliable reading progress and private notes across browser sessions.</p>`;
  }).join("");
  check(await db.from("paper_content").insert({
    paper_id: paperId,
    kind: "html",
    sanitized_html: html,
  }));

  const cookies = [];
  const client = createServerClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookies,
      setAll: (values) => {
        for (const value of values) {
          const previous = cookies.findIndex((cookie) => cookie.name === value.name);
          if (previous >= 0) cookies.splice(previous, 1);
          cookies.push(value);
        }
      },
    },
  });
  check(await client.auth.signInWithPassword({ email, password }));

  browser = await chromium.launch({
    ...(process.env.READER_SAVE_CHROMIUM
      ? { executablePath: process.env.READER_SAVE_CHROMIUM }
      : {}),
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const authCookies = cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    url: baseUrl,
    httpOnly: false,
    sameSite: "Lax",
  }));
  await context.addCookies(authCookies);
  const page = await context.newPage();
  const pageErrors = [];
  const dialogs = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });

  await page.goto(`${baseUrl}/reader/${paperId}`);
  await page.locator(".paper-html").waitFor();
  await page.evaluate(() => {
    window.scrollTo(0, 100);
    window.dispatchEvent(new Event("scroll"));
  });
  await page.getByRole("link", { name: "Back to paper details" }).click();
  await page.waitForURL(/\/paper\//);
  assert.equal(dialogs.length, 0);
  console.log("PASS: ordinary scroll does not prompt on navigation");

  await page.goto(`${baseUrl}/reader/${paperId}`);
  await page.locator(".paper-html").waitFor();
  const stopFailingMark = await failNextAction(page);
  await page.getByRole("button", { name: "I finished here" }).click();
  await page.getByRole("alert").filter({ hasText: /Couldn’t save/ }).waitFor();
  assert.equal(await page.locator('[data-testid="read-mark"]').getAttribute("data-save-state"), "unsaved");
  assert.match(await page.getByRole("button", { name: /Clear mark/ }).innerText(), /unsaved/);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByRole("status").filter({ hasText: /^Saved$/ }).first().waitFor();
  await stopFailingMark();
  console.log("PASS: failed mark is visibly unsaved until retry is acknowledged");
  const progress = check(await db.from("reading_progress").select("*")
    .eq("user_id", userId).eq("paper_id", paperId).single());
  assert(progress.marked_pct > 0);
  console.log("PASS: acknowledged HTML progress persisted in local Supabase");

  await selectText(page, 0, 10, 16);
  await page.getByRole("button", { name: "Highlight", exact: true }).waitFor();
  // Commit the insert, then discard its response. Retry must recover the same UUID.
  const stopDroppingCreation = await failNextAction(page, { commit: true });
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: /Couldn’t save/ }).waitFor();
  assert.equal(check(await db.from("highlights").select("*").eq("user_id", userId)).length, 1,
    "Creation should commit before the response is discarded");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.locator("mark.pd-highlight").waitFor();
  assert.equal(check(await db.from("highlights").select("*").eq("user_id", userId)).length, 1);
  await stopDroppingCreation();
  console.log("PASS: lost creation response + retry leaves exactly one highlight");

  // Cancel deletes a committed insert before another overlapping range is selected.
  await selectText(page, 1, 0, 5);
  const stopDroppingCancel = await failNextAction(page, { commit: true });
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: /Couldn’t save/ }).waitFor();
  assert.equal(check(await db.from("highlights").select("id").eq("user_id", userId)).length, 2);
  await stopDroppingCancel();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Highlight", exact: true }).waitFor({ state: "hidden" });
  assert.equal(check(await db.from("highlights").select("id").eq("user_id", userId)).length, 1);
  await selectText(page, 1, 0, 8);
  await page.getByRole("button", { name: "Highlight", exact: true }).waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  console.log("PASS: Cancel removes an uncertain creation and frees overlapping selection");

  await context.clearCookies();
  let actionPosts = 0;
  const countAction = (request) => {
    if (request.method() === "POST" && request.url().includes(`/reader/${paperId}`)) {
      actionPosts += 1;
    }
  };
  page.on("request", countAction);
  await selectText(page, 2, 0, 5);
  await page.getByRole("button", { name: "Highlight", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: /sign in/i }).waitFor();
  const postsBeforeCancel = actionPosts;
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Highlight", exact: true }).waitFor({ state: "hidden" });
  assert.equal(actionPosts, postsBeforeCancel, "Cancel after auth failure must not request a delete");
  page.off("request", countAction);
  await context.addCookies(authCookies);
  console.log("PASS: Cancel after auth failure closes without a delete request");

  await page.locator("mark.pd-highlight").click();
  await page.getByRole("textbox", { name: "Note" }).fill("Persistent research note");
  const stopFailingNote = await failNextAction(page, { delayMs: 700 });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("status").filter({ hasText: /Saving/ }).waitFor();
  assert(await page.getByRole("button", { name: "Save", exact: true }).isDisabled());
  await page.getByRole("alert").filter({ hasText: /Couldn’t save/ }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Note" }).inputValue(), "Persistent research note");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByRole("textbox", { name: "Note" }).waitFor({ state: "hidden" });
  assert.equal(check(await db.from("highlights").select("note").eq("user_id", userId).single()).note,
    "Persistent research note");
  await stopFailingNote();
  console.log("PASS: note failure retains draft; retry persists it");

  const second = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await second.addCookies(authCookies);
  const phone = await second.newPage();
  await phone.goto(`${baseUrl}/reader/${paperId}`);
  await phone.locator("mark.pd-highlight").waitFor();
  assert.equal(await phone.locator('[data-testid="read-mark"]').count(), 1);
  await phone.locator("mark.pd-highlight").click();
  assert.equal(await phone.getByRole("textbox", { name: "Note" }).inputValue(),
    "Persistent research note");
  await phone.getByRole("button", { name: "Cancel", exact: true }).click();
  await phone.reload();
  await phone.locator("mark.pd-highlight").waitFor();
  await phone.screenshot({ path: join(tmpdir(), "paperdeck-saved-mobile.png") });
  console.log("PASS: reload and a second mobile browser context restore mark and note");

  await page.locator("mark.pd-highlight").click();
  const stopFailingDelete = await failNextAction(page);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: /Couldn’t save/ }).waitFor();
  assert.equal(await page.locator("mark.pd-highlight").count(), 1);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.locator("mark.pd-highlight").waitFor({ state: "hidden" });
  assert.equal(check(await db.from("highlights").select("id").eq("user_id", userId)).length, 0);
  await stopFailingDelete();
  console.log("PASS: failed deletion retains highlight until retry succeeds");
  assert.deepEqual(pageErrors, []);
  console.log("PASS: no uncaught browser errors");
}

async function cleanup() {
  const errors = [];
  async function attempt(label, operation) {
    try {
      const result = await operation();
      if (result !== undefined) check(result);
    } catch (error) {
      errors.push({ label, error });
    }
  }

  if (browser) await attempt("browser", () => browser.close());
  for (const table of ["paper_content", "reading_progress", "highlights"]) {
    await attempt(table, () => db.from(table).delete().eq("paper_id", paperId));
  }
  await attempt("papers", () => db.from("papers").delete().eq("id", paperId));
  if (userId) await attempt("temporary user", () => db.auth.admin.deleteUser(userId));
  return errors;
}

let verificationError;
try {
  await verify();
} catch (error) {
  verificationError = error;
}
const cleanupErrors = await cleanup();
if (verificationError) console.error(`Verification failed: ${errorMessage(verificationError)}`);
for (const { label, error } of cleanupErrors) {
  console.error(`Cleanup failed (${label}): ${errorMessage(error)}`);
}
if (verificationError || cleanupErrors.length) process.exitCode = 1;
