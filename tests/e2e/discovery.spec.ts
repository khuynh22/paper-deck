import { test, expect, admin } from "./fixtures";
import { randomUUID } from "node:crypto";

for (const path of ["/", "/search"] as const) {
  test(`${path} combines filters and restores page two after back and reload`, async ({ page, seed }, testInfo) => {
    const topic = "test." + randomUUID(), venue = "Fixture " + seed.userId;
    const rows = Array.from({ length: 53 }, (_, i) => ({
      id: randomUUID(), title: `Paging fixture ${i}`, categories: [i === 50 ? "other.topic" : topic],
      venue: i === 51 ? "Other venue" : venue, published_at: i === 52 ? "2025-01-15T00:00:00Z" : "2026-01-15T23:59:59Z",
    }));
    try {
      expect((await admin.from("papers").insert(rows)).error).toBeNull();
      await page.goto(path);
      if (path === "/search") await page.getByRole("search").filter({ has: page.getByRole("button", { name: "Apply filters" }) }).getByRole("searchbox", { name: "Search papers" }).fill("paging");
      await page.getByLabel("Topic / category", { exact: true }).fill(topic);
      await page.getByLabel("Venue", { exact: true }).fill(venue);
      await page.getByLabel("Published from", { exact: true }).fill("2026-01-01");
      await page.getByLabel("Published through", { exact: true }).fill("2026-01-15");
      await page.getByRole("button", { name: "Apply filters", exact: true }).click();
      await expect(page.locator("article h3 a")).toHaveCount(40);
      await expect(page.locator("article h3 a").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("discovery.png"), animations: "disabled" });
      const first = await page.locator("article h3 a").evaluateAll(links => links.map(link => link.getAttribute("href")));
      await page.getByRole("link", { name: "Next page", exact: true }).click();
      await expect(page.locator("article h3 a")).toHaveCount(10);
      const second = await page.locator("article h3 a").evaluateAll(links => links.map(link => link.getAttribute("href")));
      expect(new Set([...first, ...second]).size).toBe(50);
      expect(new Set([...first, ...second])).toEqual(new Set(rows.slice(0, 50).map(row => `/paper/${row.id}`)));
      const pageTwo = page.url();
      expect(new URL(pageTwo).searchParams.get("page")).toBe("2");
      expect(new URL(pageTwo).searchParams.get("asof")).toBeTruthy();
      await page.locator("article h3 a").first().click();
      await expect(page).toHaveURL(/\/paper\//);
      await page.goBack();
      await expect(page).toHaveURL(pageTwo);
      await expect(page.getByLabel("Venue", { exact: true })).toHaveValue(venue);
      await page.reload();
      await expect(page.locator("article h3 a")).toHaveCount(10);
      expect(await page.locator("article h3 a").evaluateAll(links => links.map(link => link.getAttribute("href")))).toEqual(second);
      await page.getByLabel("Venue", { exact: true }).fill("No matching venue");
      await page.getByRole("button", { name: "Apply filters", exact: true }).click();
      await expect(page.getByText("No papers match this selection", { exact: true })).toBeVisible();
      expect(new URL(page.url()).searchParams.has("page")).toBe(false);
      await page.goto(`${path}?topic=invalid%27&page=-1`);
      await expect(page.getByRole("alert").filter({ hasText: "Some invalid filters" })).toBeVisible();
    } finally { await admin.from("papers").delete().in("id", rows.map(row => row.id)); }
  });
}
