import { test, expect, admin, authenticate } from "./fixtures";
import { randomUUID } from "node:crypto";

test("My Notes edits survive lost responses and passage links validate source text", async ({
  page,
  context,
  seed,
}) => {
  const valid = randomUUID(),
    missing = randomUUID();
  expect(
    (
      await admin.from("highlights").insert([
        {
          id: valid,
          user_id: seed.userId,
          paper_id: seed.htmlId,
          block_anchor: "8",
          start_offset: 0,
          end_offset: 10,
          quote: "Passage 8:",
          note: "Original thought",
        },
        {
          id: missing,
          user_id: seed.userId,
          paper_id: seed.htmlId,
          block_anchor: "9",
          start_offset: 0,
          end_offset: 10,
          quote: "Old source",
          note: "Preserved drifted note",
        },
      ])
    ).error,
  ).toBeNull();
  await page.goto("/notes?q=Original");
  const card = page.getByRole("article");
  await expect(card).toHaveCount(1);
  await card.getByRole("button", { name: "Edit note", exact: true }).click();
  await card
    .getByRole("textbox", { name: "Edit note", exact: true })
    .fill("Revised durable thought");
  let lost = false;
  await context.route("**/notes?*", async (route) => {
    if (!lost && route.request().method() === "POST") {
      lost = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await card.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole("textbox", { name: "Edit note", exact: true }),
  ).toHaveValue("Revised durable thought");
  await card.getByRole("button", { name: "Retry", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await admin.from("highlights").select("note").eq("id", valid).single())
          .data?.note,
    )
    .toBe("Revised durable thought");
  await page.goto("/notes?q=Revised");
  await page.getByRole("link", { name: "Open passage", exact: true }).click();
  const mark = page.locator(`mark[data-hl-id="${valid}"]`);
  await expect(mark).toBeInViewport();
  await expect(mark).toBeFocused();
  await page.goto(`/reader/${seed.htmlId}?highlight=${missing}`);
  await expect(
    page.getByRole("status", { name: "Passage unavailable" }),
  ).toContainText("Old source");
  await expect(
    page.getByRole("status", { name: "Passage unavailable" }),
  ).toContainText("Preserved drifted note");
  await page.getByRole("link", { name: "Back to My Notes" }).click();
  const revised = page
    .getByRole("article")
    .filter({ hasText: "Revised durable thought" });
  await revised
    .getByRole("button", { name: "Delete highlight", exact: true })
    .click();
  await expect(revised).toHaveCount(0);
  await page.goto(`/reader/${seed.htmlId}?highlight=${valid}`);
  await expect(
    page.getByRole("status", { name: "Passage unavailable" }),
  ).toContainText("unavailable in your account");
});

test("My Notes pagination, search, paper filters and owner privacy", async ({
  page,
  browser,
  seed,
}) => {
  const rows = Array.from({ length: 53 }, (_, i) => ({
    id: randomUUID(),
    user_id: seed.userId,
    paper_id: i < 50 ? seed.htmlId : seed.pdfId,
    block_anchor: "0",
    start_offset: 0,
    end_offset: 7,
    quote: "Passage",
    note: `Private idea ${i}`,
    updated_at: "2026-01-01T00:00:00Z",
  }));
  expect((await admin.from("highlights").insert(rows)).error).toBeNull();
  await page.goto(`/notes?q=private&paper=${seed.htmlId}`);
  await expect(page.getByRole("article")).toHaveCount(40);
  const first = await page
    .getByRole("link", { name: "Open passage" })
    .evaluateAll((links) => links.map((a) => a.getAttribute("href")));
  await page.getByRole("link", { name: "Next page", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(10);
  const rest = await page
    .getByRole("link", { name: "Open passage" })
    .evaluateAll((links) => links.map((a) => a.getAttribute("href")));
  expect(new Set([...first, ...rest]).size).toBe(50);
  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(10);
  await page
    .getByRole("combobox", { name: "Paper", exact: true })
    .selectOption(seed.pdfId);
  await page.getByRole("button", { name: "Search notes", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(3);
  const email = `notes-other-${randomUUID()}@example.test`,
    password = randomUUID() + "Aa1!";
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(created.error).toBeNull();
  const second = await browser.newContext();
  try {
    const client = await authenticate(second, email, password);
    for (const rpc of ["my_notes", "my_note_papers"]) {
      const result = await client.rpc(rpc);
      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    }
    const other = await second.newPage();
    await other.goto("http://127.0.0.1:3102/notes");
    await expect(
      other.getByText("No highlights match this view"),
    ).toBeVisible();
    await other.goto(
      `http://127.0.0.1:3102/reader/${seed.htmlId}?highlight=${rows[0].id}`,
    );
    await expect(
      other.getByRole("status", { name: "Passage unavailable" }),
    ).toContainText("unavailable in your account");
  } finally {
    await second.close();
    await admin.auth.admin.deleteUser(created.data.user!.id);
  }
});
