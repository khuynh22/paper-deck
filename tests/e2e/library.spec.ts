import { test, expect, admin, authenticate } from "./fixtures";
import { randomUUID } from "node:crypto";

test("status and collection CRUD preserve saved reading state and stay private", async ({
  page,
  browser,
  seed,
}) => {
  const progress = {
    user_id: seed.userId,
    paper_id: seed.htmlId,
    status: "reading",
    scroll_pct: 0.5,
    block_anchor: "8",
    read_pct: 0.6,
    marked_pct: 0.4,
  };
  expect(
    (
      await admin.from("stars").insert([
        { user_id: seed.userId, paper_id: seed.htmlId },
        { user_id: seed.userId, paper_id: seed.pdfId },
      ])
    ).error,
  ).toBeNull();
  expect(
    (await admin.from("reading_progress").insert(progress)).error,
  ).toBeNull();
  expect(
    (
      await admin
        .from("highlights")
        .insert({
          user_id: seed.userId,
          paper_id: seed.htmlId,
          block_anchor: "0",
          start_offset: 0,
          end_offset: 7,
          quote: "Passage",
          note: "Preserve this note",
        })
    ).error,
  ).toBeNull();
  await page.goto("/library?status=to_read");
  await expect(
    page.getByRole("link", { name: seed.title, exact: true }),
  ).toHaveCount(0);
  await expect(page.locator("article h3 a")).toHaveCount(1);
  await page.goto("/library");
  const paper = page.getByRole("region", { name: seed.title, exact: true });
  await paper
    .getByRole("combobox", { name: "Reading status", exact: true })
    .selectOption("done");
  await expect
    .poll(
      async () =>
        (
          await admin
            .from("reading_progress")
            .select("status,scroll_pct,block_anchor,read_pct,marked_pct")
            .eq("user_id", seed.userId)
            .single()
        ).data,
    )
    .toEqual({
      status: "done",
      scroll_pct: 0.5,
      block_anchor: "8",
      read_pct: 0.6,
      marked_pct: 0.4,
    });
  await expect(
    paper.getByRole("combobox", { name: "Reading status", exact: true }),
  ).toHaveValue("done");
  await page.getByText("Manage collections", { exact: true }).click();
  for (const name of ["Project Alpha", "Project Beta"]) {
    await page
      .getByRole("textbox", { name: "New collection name", exact: true })
      .fill(name);
    await page
      .getByRole("button", { name: "Create collection", exact: true })
      .click();
    await expect(
      page
        .getByRole("navigation", { name: "Collections", exact: true })
        .getByRole("link", { name, exact: true }),
    ).toBeVisible();
  }
  await paper.getByText("Collections (0)", { exact: true }).click();
  for (const name of ["Project Alpha", "Project Beta"]) {
    await paper.getByRole("checkbox", { name, exact: true }).click();
    await expect(
      paper.getByRole("checkbox", { name, exact: true }),
    ).toBeChecked();
  }
  await page
    .getByRole("textbox", { name: "Name for Project Alpha", exact: true })
    .fill("Renamed project");
  await page
    .getByRole("button", { name: "Rename Project Alpha", exact: true })
    .click();
  await expect(
    page
      .getByRole("navigation", { name: "Collections", exact: true })
      .getByRole("link", { name: "Renamed project", exact: true }),
  ).toBeVisible();
  const collections = (
    await admin.from("collections").select("id,name").eq("user_id", seed.userId)
  ).data!;
  const otherEmail = `library-other-${randomUUID()}@example.test`,
    password = randomUUID() + "Aa1!";
  const otherUser = await admin.auth.admin.createUser({
    email: otherEmail,
    password,
    email_confirm: true,
  });
  expect(otherUser.error).toBeNull();
  const second = await browser.newContext();
  try {
    const client = await authenticate(second, otherEmail, password);
    for (const table of ["collections", "collection_papers"]) {
      const read = await client.from(table).select("*");
      expect(read.error).toBeNull();
      expect(read.data).toEqual([]);
      const removed = await client
        .from(table)
        .delete()
        .eq("user_id", seed.userId)
        .select();
      expect(removed.data).toEqual([]);
    }
    expect(
      (
        await client
          .from("collections")
          .update({ name: "Stolen" })
          .eq("id", collections[0].id)
          .select()
      ).data,
    ).toEqual([]);
    expect(
      (
        await client.rpc("library_papers", {
          selected_collection: collections[0].id,
        })
      ).data,
    ).toEqual([]);
    expect(
      (
        await client
          .from("stars")
          .insert({ user_id: otherUser.data.user!.id, paper_id: seed.htmlId })
      ).error,
    ).toBeNull();
    expect(
      (
        await client
          .from("collection_papers")
          .insert({
            user_id: otherUser.data.user!.id,
            collection_id: collections[0].id,
            paper_id: seed.htmlId,
          })
      ).error,
    ).not.toBeNull();
    const other = await second.newPage();
    await other.goto("http://127.0.0.1:3102/library");
    await expect(
      other
        .getByRole("navigation", { name: "Collections", exact: true })
        .getByRole("link", { name: "Renamed project", exact: true }),
    ).toHaveCount(0);
  } finally {
    await second.close();
    await admin.auth.admin.deleteUser(otherUser.data.user!.id);
  }
  await page
    .getByRole("navigation", { name: "Collections", exact: true })
    .getByRole("link", { name: "Renamed project", exact: true })
    .click();
  await expect(page.locator("article h3 a")).toHaveCount(1);
  const selectedUrl = page.url();
  await page.reload();
  await expect(page).toHaveURL(selectedUrl);
  await expect(
    page.getByRole("link", { name: seed.title, exact: true }),
  ).toBeVisible();
  await page.getByText("Manage collections", { exact: true }).click();
  await page
    .getByRole("button", { name: "Delete Renamed project", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await admin
            .from("collections")
            .select("id")
            .eq("user_id", seed.userId)
        ).data?.length,
    )
    .toBe(1);
  await expect(page).not.toHaveURL(/collection=/);
  expect(
    (await admin.from("stars").select("paper_id").eq("user_id", seed.userId))
      .data,
  ).toHaveLength(2);
  expect(
    (await admin.from("highlights").select("note").eq("user_id", seed.userId))
      .data,
  ).toEqual([{ note: "Preserve this note" }]);
  expect(
    (
      await admin
        .from("reading_progress")
        .select("status,block_anchor,marked_pct")
        .eq("user_id", seed.userId)
    ).data,
  ).toEqual([{ status: "done", block_anchor: "8", marked_pct: 0.4 }]);
  expect(
    (
      await admin
        .from("collection_papers")
        .select("paper_id")
        .eq("user_id", seed.userId)
    ).data,
  ).toHaveLength(1);
});

test("library combines search, status and sorting beyond forty with URL restoration", async ({
  page,
  seed,
}) => {
  const rows = Array.from({ length: 53 }, (_, i) => ({
    id: randomUUID(),
    title: `Library paging fixture ${i}`,
  }));
  try {
    expect((await admin.from("papers").insert(rows)).error).toBeNull();
    expect(
      (
        await admin
          .from("stars")
          .insert(
            rows.map((p) => ({
              user_id: seed.userId,
              paper_id: p.id,
              created_at: "2026-01-01T00:00:00Z",
            })),
          )
      ).error,
    ).toBeNull();
    expect(
      (
        await admin
          .from("reading_progress")
          .insert(
            rows
              .slice(50)
              .map((p) => ({
                user_id: seed.userId,
                paper_id: p.id,
                status: "done",
              })),
          )
      ).error,
    ).toBeNull();
    await page.goto("/library?q=library+fixture&status=to_read&sort=title");
    await expect(page.locator("article h3 a")).toHaveCount(40);
    const first = await page
      .locator("article h3 a")
      .evaluateAll((links) => links.map((a) => a.getAttribute("href")));
    await page.getByRole("link", { name: "Next page", exact: true }).click();
    await expect(page.locator("article h3 a")).toHaveCount(10);
    const rest = await page
      .locator("article h3 a")
      .evaluateAll((links) => links.map((a) => a.getAttribute("href")));
    expect(new Set([...first, ...rest])).toEqual(
      new Set(rows.slice(0, 50).map((p) => `/paper/${p.id}`)),
    );
    const url = page.url();
    await page.locator("article h3 a").first().click();
    await expect(page).toHaveURL(/\/paper\//);
    await page.goBack();
    await expect(page).toHaveURL(url);
    await page.reload();
    await expect(page.locator("article h3 a")).toHaveCount(10);
    await page
      .getByRole("combobox", { name: "Status", exact: true })
      .selectOption("done");
    await page
      .getByRole("button", { name: "Apply library filters", exact: true })
      .click();
    await expect(page.locator("article h3 a")).toHaveCount(3);
    expect(new URL(page.url()).searchParams.has("page")).toBe(false);
  } finally {
    await admin
      .from("papers")
      .delete()
      .in(
        "id",
        rows.map((p) => p.id),
      );
  }
});
