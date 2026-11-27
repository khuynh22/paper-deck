import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium, devices } from "playwright";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const baseUrl = process.env.DISCOVERY_BASE_URL ?? "http://localhost:3000";
for (const url of [supabaseUrl, baseUrl]) {
  assert(url && ["localhost", "127.0.0.1"].includes(new URL(url).hostname),
    "Discovery verification requires a local app and database");
}

const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const fixtureId = randomUUID();
const topic = `test.${fixtureId}`;
const venue = `Fixture ${fixtureId}`;
const rows = Array.from({ length: 53 }, (_, index) => ({
  id: randomUUID(),
  title: `Paging fixture ${index}`,
  categories: [index === 50 ? "other.topic" : topic],
  venue: index === 51 ? "Other venue" : venue,
  published_at: index === 52 ? "2025-01-15T00:00:00Z" : "2026-01-15T23:59:59Z",
}));
const matchingHrefs = new Set(rows.slice(0, 50).map(row => `/paper/${row.id}`));

async function results(page, count, pageNumber) {
  await page.getByRole("navigation", { name: "Results pages" })
    .getByText(`Showing ${count} papers · Page ${pageNumber}`, { exact: true }).waitFor();
  const links = await page.locator("article h3 a").evaluateAll(nodes =>
    nodes.map(node => node.getAttribute("href")));
  assert.equal(links.length, count);
  return links;
}

async function verify(page, path) {
  await page.goto(path);
  const apply = page.getByRole("button", { name: "Apply filters", exact: true });
  if (path === "/search") {
    await page.getByRole("search").filter({ has: apply })
      .getByRole("searchbox", { name: "Search papers" }).fill("paging");
  }
  const venueInput = page.getByLabel("Venue", { exact: true });
  await page.getByLabel("Topic / category", { exact: true }).fill(topic);
  await venueInput.fill(venue);
  await page.getByLabel("Published from", { exact: true }).fill("2026-01-01");
  await page.getByLabel("Published through", { exact: true }).fill("2026-01-15");
  await apply.click();
  const first = await results(page, 40, 1);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

  await page.getByRole("link", { name: "Next page", exact: true }).click();
  const second = await results(page, 10, 2);
  assert.deepEqual(new Set([...first, ...second]), matchingHrefs);
  const pageTwo = page.url();
  const nextParams = new URL(pageTwo).searchParams;
  assert.equal(nextParams.get("page"), "2");
  assert(nextParams.get("asof"));

  await page.locator("article h3 a").first().click();
  await page.waitForURL(new URL(second[0], baseUrl).href);
  await page.getByRole("heading", { level: 1, name: /^Paging fixture / }).waitFor();
  await page.goBack();
  await page.waitForURL(pageTwo);
  assert.equal(await venueInput.inputValue(), venue);
  await page.reload();
  assert.deepEqual(await results(page, 10, 2), second);

  await venueInput.fill("No matching venue");
  await apply.click();
  await page.getByText("No papers match this selection", { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.has("page"), false);
  await page.getByRole("link", { name: "Clear filters", exact: true }).click();
  await page.waitForURL(url => !url.searchParams.has("venue"));
  assert.equal(await venueInput.inputValue(), "");

  await page.goto(`${path}?topic=invalid%27&page=-1`);
  await page.getByRole("alert").filter({ hasText: "Some invalid filters" }).waitFor();
}

const { error: seedError } = await admin.from("papers").insert(rows);
if (seedError) throw new Error(seedError.message);

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.DISCOVERY_CHROMIUM });
  for (const [device, settings] of [["desktop", devices["Desktop Chrome"]], ["mobile", devices["iPhone 13"]]]) {
    const context = await browser.newContext({ ...settings, baseURL: baseUrl });
    try {
      const page = await context.newPage();
      for (const path of ["/", "/search"]) {
        await verify(page, path);
        console.log(`Discovery passed on ${device}: ${path}`);
      }
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  const { error } = await admin.from("papers").delete().in("id", rows.map(row => row.id));
  if (error) throw new Error(error.message);
}
