import { test, expect, admin } from "./fixtures";
import { pdfFixture } from "./pdf";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import type { BrowserContext } from "@playwright/test";
async function intercept(context: BrowserContext, id: string, fixture: Buffer) {
  const require = createRequire(join(process.cwd(), "package.json")),
    pdfRequire = createRequire(require.resolve("react-pdf")),
    worker = join(
      dirname(pdfRequire.resolve("pdfjs-dist/package.json")),
      "build/pdf.worker.min.mjs",
    );
  await context.route(
    "https://unpkg.com/pdfjs-dist@*/build/pdf.worker.min.mjs",
    (route) =>
      route.fulfill({
        path: worker,
        contentType: "application/javascript",
        headers: { "access-control-allow-origin": "*" },
      }),
  );
  await context.route(`**/api/reader/${id}?pdf=1`, (route) =>
    route.fulfill({ body: fixture, contentType: "application/pdf" }),
  );
}
test("long PDF resumes, searches, selects text and keeps a bounded render window through resize", async ({
  page,
  context,
  seed,
}) => {
  await intercept(context, seed.pdfId, pdfFixture({ pages: 60, links: true }));
  expect(
    (
      await admin.from("reading_progress").insert({
        user_id: seed.userId,
        paper_id: seed.pdfId,
        reader_kind: "pdf",
        block_anchor: "40",
        marked_anchor: "30",
        status: "reading",
      })
    ).error,
  ).toBeNull();
  await page.goto(`/reader/${seed.pdfId}`);
  await expect(page.locator('[data-page="40"] canvas')).toBeVisible();
  await expect(
    page.getByRole("spinbutton", { name: "PDF page number" }),
  ).toHaveValue("40");
  expect(await page.locator("[data-page] canvas").count()).toBeLessThanOrEqual(
    5,
  );
  const top = await page
    .locator('[data-page="40"]')
    .evaluate((node) => node.getBoundingClientRect().top);
  await page.getByRole("combobox", { name: "Zoom" }).selectOption("0.75");
  await expect
    .poll(
      async () =>
        await page
          .locator('[data-page="40"]')
          .evaluate((node) => node.getBoundingClientRect().top),
    )
    .toBeCloseTo(top, 0);
  await page.setViewportSize({ width: 600, height: 800 });
  await expect(
    page.getByRole("spinbutton", { name: "PDF page number" }),
  ).toHaveValue("40");
  await page
    .getByRole("textbox", { name: "Search PDF", exact: true })
    .fill("page 37");
  await page
    .getByRole("textbox", { name: "Search PDF", exact: true })
    .press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "1 matching page" }),
  ).toBeVisible();
  await expect(page.locator('[data-page="37"] .textLayer')).toBeVisible();
  await expect(
    page.getByRole("spinbutton", { name: "PDF page number" }),
  ).toHaveValue("37");
  const selection = await page
    .locator('[data-page="37"] .textLayer span')
    .first()
    .evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      return selection.toString();
    });
  expect(selection).toContain("page 37");
  await page.getByRole("button", { name: "I finished here" }).click();
  await expect
    .poll(
      async () =>
        (
          await admin
            .from("reading_progress")
            .select("marked_anchor")
            .eq("user_id", seed.userId)
            .single()
        ).data?.marked_anchor,
    )
    .toBe("37");
  await page.reload();
  await expect(page.locator('[data-page="37"] canvas')).toBeVisible();
  await page.getByRole("spinbutton", { name: "PDF page number" }).fill("1");
  await page
    .getByRole("spinbutton", { name: "PDF page number" })
    .press("Enter");
  const safe = page.locator(
    '.annotationLayer a[href="https://example.org/research"]',
  );
  await expect(safe).toHaveAttribute("target", "_blank");
  await expect(safe).toHaveAttribute("rel", /noopener/);
  await expect(
    page.locator('.annotationLayer a[href^="javascript:"]'),
  ).toHaveCount(0);
  await context.route("https://example.org/research", (route) =>
    route.fulfill({ body: "Safe fixture link" }),
  );
  const popupPromise = page.waitForEvent("popup");
  await safe.focus();
  await page.keyboard.press("Enter");
  const popup = await popupPromise;
  await expect(popup).toHaveURL("https://example.org/research");
  await popup.close();
  await page.locator('.annotationLayer a[href="#"]').first().click();
  await expect(
    page.getByRole("spinbutton", { name: "PDF page number" }),
  ).toHaveValue("60");
  expect(await page.locator("[data-page] canvas").count()).toBeLessThanOrEqual(
    5,
  );
});
test("image-only PDFs report unavailable text rather than successful empty search", async ({
  page,
  context,
  seed,
}) => {
  await intercept(context, seed.pdfId, pdfFixture({ pages: 3, scanned: true }));
  await page.goto(`/reader/${seed.pdfId}`);
  await expect(
    page
      .getByText("This page has no selectable text. Scanned pages require OCR.")
      .first(),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search PDF", exact: true })
    .fill("research");
  await page.getByRole("button", { name: "Search PDF", exact: true }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "This PDF has no selectable text" }),
  ).toBeVisible();
});
