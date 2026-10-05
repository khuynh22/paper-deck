import { test, expect, admin, authenticate } from "./fixtures";
import { pdfFixture } from "./pdf";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
test("PDF highlights retry idempotently, preserve notes through zoom, and stay private", async ({
  page,
  context,
  browser,
  seed,
}) => {
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
  let changed = false;
  await context.route(`**/api/reader/${seed.pdfId}?pdf=1`, (route) =>
    route.fulfill({
      body: pdfFixture({ pages: 10, scanned: changed }),
      contentType: "application/pdf",
    }),
  );
  await page.goto(`/reader/${seed.pdfId}`);
  await expect(
    page.locator('[data-page="1"] .textLayer span').first(),
  ).toBeVisible();
  await page.getByRole("spinbutton", { name: "PDF page number" }).fill("4");
  await page
    .getByRole("spinbutton", { name: "PDF page number" })
    .press("Enter");
  await expect(
    page.locator('[data-page="4"] .textLayer span').first(),
  ).toBeVisible();
  let lost = false;
  await context.route(`**/reader/${seed.pdfId}`, async (route) => {
    if (
      !lost &&
      route.request().method() === "POST" &&
      route.request().postData()?.includes("pdfAnchor")
    ) {
      lost = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .locator('[data-page="4"] .textLayer span')
    .first()
    .evaluate((node) => {
      const range = document.createRange();
      range.setStart(node.firstChild!, 0);
      range.setEnd(node.firstChild!, node.firstChild!.textContent!.length);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
  const create = page.getByRole("dialog", { name: "Save PDF highlight" });
  await expect(create).toContainText("PDF page 4 research");
  await create
    .getByRole("button", { name: "Save highlight", exact: true })
    .click();
  await create.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(create).toHaveCount(0);
  const highlights = await admin
    .from("highlights")
    .select("*")
    .eq("user_id", seed.userId);
  expect(highlights.error).toBeNull();
  expect(highlights.data).toHaveLength(1);
  const saved = highlights.data![0];
  expect(saved.pdf_anchor.page).toBe(4);
  const mark = page.locator(`[data-pdf-highlight="${saved.id}"]`).first();
  await expect(mark).toBeVisible();
  await mark.click();
  const edit = page.getByRole("dialog", { name: "Edit PDF note" });
  await edit
    .getByRole("textbox", { name: "PDF note" })
    .fill("Private PDF insight");
  // Keep the pending draft's page mounted while navigating outside the render window.
  await page.getByRole("spinbutton", { name: "PDF page number" }).fill("9");
  await page
    .getByRole("spinbutton", { name: "PDF page number" })
    .press("Enter");
  await expect(edit.getByRole("textbox", { name: "PDF note" })).toHaveValue(
    "Private PDF insight",
  );
  expect(await page.locator("canvas").count()).toBeLessThanOrEqual(6);
  await edit.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(edit).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (
          await admin
            .from("highlights")
            .select("note")
            .eq("id", saved.id)
            .single()
        ).data?.note,
    )
    .toBe("Private PDF insight");
  await page.goto("/notes?q=Private+PDF+insight");
  await page.getByRole("link", { name: "Open passage", exact: true }).click();
  await expect(mark).toBeInViewport();
  await expect(mark).toBeFocused();
  await page.getByRole("combobox", { name: "Zoom" }).selectOption("0.75");
  await page.setViewportSize({ width: 500, height: 800 });
  await expect(mark).toBeVisible();
  await expect
    .poll(async () =>
      mark.evaluate((node, expected) => {
        const parent = node.closest("[data-page]");
        if (!parent) return 1;
        const rect = node.getBoundingClientRect(),
          frame = parent.getBoundingClientRect();
        return Math.max(
          Math.abs((rect.left - frame.left) / frame.width - expected.x),
          Math.abs((rect.top - frame.top) / frame.height - expected.y),
        );
      }, saved.pdf_anchor.rects[0]),
    )
    .toBeLessThan(0.01);
  const email = `pdf-other-${randomUUID()}@example.test`,
    password = randomUUID() + "Aa1!",
    created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  expect(created.error).toBeNull();
  const other = await browser.newContext();
  try {
    const client = await authenticate(other, email, password);
    expect(
      (await client.from("highlights").select("*").eq("id", saved.id)).data,
    ).toEqual([]);
    expect(
      (
        await client
          .from("highlights")
          .update({ note: "stolen" })
          .eq("id", saved.id)
          .select()
      ).data,
    ).toEqual([]);
  } finally {
    await other.close();
    await admin.auth.admin.deleteUser(created.data.user!.id);
  }
  changed = true;
  await page.reload();
  await expect(
    page.getByRole("status", { name: "Passage unavailable" }),
  ).toContainText("Private PDF insight");
  await expect(page.locator("[data-pdf-highlight]")).toHaveCount(0);
  changed = false;
  await page.reload();
  await expect(mark).toBeVisible();
  await mark.click();
  await page
    .getByRole("dialog", { name: "Edit PDF note" })
    .getByRole("button", { name: "Delete highlight", exact: true })
    .click();
  await expect(mark).toHaveCount(0);
  await page.reload();
  await expect(page.locator("[data-pdf-highlight]")).toHaveCount(0);
});
