import { randomUUID } from "node:crypto";
import { test, expect, admin, authenticate } from "./fixtures";

test("saved searches return new deduplicated private matches and preserve library data", async ({
  page,
  seed,
  browser,
}) => {
  const token = "interest" + randomUUID().replaceAll("-", "");
  const paperId = randomUUID();
  await page.goto("/search?q=" + token);
  await page.getByText("Save this search", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Interest name", exact: true })
    .fill("Saved topic search");
  // Lose the acknowledgement after the save commits; the retry reuses its UUID.
  let lost = false;
  await page.route("**/search?**", async (route) => {
    if (route.request().method() === "POST" && !lost) {
      lost = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Save interest", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "retry" }),
  ).toContainText("retry");
  await page
    .getByRole("button", { name: "Save interest", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Interest saved");
  expect(
    (
      await admin
        .from("research_interests")
        .select("id")
        .eq("user_id", seed.userId)
    ).data,
  ).toHaveLength(1);
  await page.goto("/updates");
  await expect(page).toHaveURL(/asof=/);
  await expect(
    page.getByText("No matches yet.", { exact: false }),
  ).toBeVisible();
  await page.getByText("Follow a topic or author", { exact: true }).click();
  const follow = page
    .locator("details")
    .filter({
      has: page.locator("summary", { hasText: "Follow a topic or author" }),
    })
    .first();
  await follow
    .getByRole("textbox", { name: "Interest name", exact: true })
    .fill("Follow author");
  await follow
    .getByRole("textbox", { name: "Exact author name", exact: true })
    .fill(token);
  await follow
    .getByRole("button", { name: "Save interest", exact: true })
    .click();
  await expect(follow.getByRole("status")).toContainText("Interest saved");
  const inserted = await admin.from("papers").insert({
    id: paperId,
    title: token + " novel research",
    authors: [token.toUpperCase()],
    categories: ["cs.AI"],
  });
  if (inserted.error) throw inserted.error;
  try {
    await page.goto("/library");
    await page.goto("/updates");
    await expect(page).toHaveURL(/asof=/);
    const match = page.getByTestId("interest-match");
    await expect(match).toHaveCount(1);
    await expect(match).toContainText("New match");
    await expect(match).toContainText("Follow author, Saved topic search");
    const explanation = match.getByText("Why this paper?", { exact: true });
    // Keep the target clear of the fixed mobile tab bar instead of relying on
    // Chromium's nearest-edge automatic scroll position.
    await explanation.evaluate((element) =>
      element.scrollIntoView({ block: "center", behavior: "instant" }),
    );
    await explanation.click();
    await expect(match).toContainText("Author name: " + token);
    await page.screenshot({
      path: `.e2e/interests-${test.info().project.name}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Mark updates seen", exact: true })
      .click();
    await expect(page.getByText("New match", { exact: true })).toHaveCount(0);
    await admin.from("papers").update({ citations: 99 }).eq("id", paperId);
    await page
      .getByRole("button", { name: "Check for new matches", exact: true })
      .click();
    await expect(page.getByText("New match", { exact: true })).toHaveCount(0);

    const saved = page.getByRole("article", {
      name: "Saved topic search",
      exact: true,
    });
    await saved.getByText("Edit interest", { exact: true }).click();
    await saved
      .getByRole("textbox", { name: "Search words", exact: true })
      .fill("nomatch" + token);
    await saved
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(saved.getByRole("status")).toContainText("Interest saved");
    await expect(match).toContainText("Matched: Follow author");
    const author = page.getByRole("article", {
      name: "Follow author",
      exact: true,
    });
    await author.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(match).toHaveCount(0);
    await author.getByRole("button", { name: "Resume", exact: true }).click();
    await expect(match).toHaveCount(1);
    await expect(page.getByText("New match", { exact: true })).toHaveCount(0);

    const second = await browser.newContext();
    const email = randomUUID() + "@example.test",
      password = randomUUID() + "Aa1!";
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    try {
      const client = await authenticate(second, email, password);
      expect(
        (await client.from("research_interests").select("id")).data,
      ).toEqual([]);
      expect((await client.rpc("interest_updates")).data).toEqual([]);
      const otherPage = await second.newPage();
      await otherPage.goto("/updates");
      await expect(otherPage.getByTestId("interest-match")).toHaveCount(0);
    } finally {
      await second.close();
      await admin.auth.admin.deleteUser(created.data.user!.id);
    }
    await admin
      .from("stars")
      .insert({ user_id: seed.userId, paper_id: paperId });
    await admin.from("highlights").insert({
      id: randomUUID(),
      user_id: seed.userId,
      paper_id: paperId,
      block_anchor: "0",
      start_offset: 0,
      end_offset: 4,
      quote: "Keep",
      note: "Preserved note",
    });
    await author
      .getByRole("button", { name: "Delete interest", exact: true })
      .click();
    await saved
      .getByRole("button", { name: "Delete interest", exact: true })
      .click();
    await expect(
      page.getByRole("article", { name: "Saved topic search", exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await admin
          .from("stars")
          .select("paper_id")
          .eq("user_id", seed.userId)
          .eq("paper_id", paperId)
      ).data,
    ).toHaveLength(1);
    expect(
      (
        await admin
          .from("highlights")
          .select("id")
          .eq("user_id", seed.userId)
          .eq("paper_id", paperId)
      ).data,
    ).toHaveLength(1);
  } finally {
    await admin.from("papers").delete().eq("id", paperId);
  }
});

test("interest updates page through all tied matches without duplicates", async ({
  page,
  seed,
}) => {
  const token = "paging" + randomUUID().replaceAll("-", "");
  const papers = Array.from({ length: 45 }, (_, i) => ({
    id: randomUUID(),
    title: `${token} result ${i}`,
    authors: [],
    categories: ["cs.AI"],
  }));
  const inserted = await admin.from("papers").insert(papers);
  if (inserted.error) throw inserted.error;
  try {
    const interest = await admin.from("research_interests").insert({
      id: randomUUID(),
      user_id: seed.userId,
      name: "Paged updates",
      query_text: token,
    });
    if (interest.error) throw interest.error;
    await page.goto("/updates");
    await expect(page).toHaveURL(/asof=/);
    await expect(page.getByTestId("interest-match")).toHaveCount(40);
    const first = await page
      .getByTestId("interest-match")
      .locator("h2,h3")
      .allTextContents();
    await page.getByRole("link", { name: "Next page", exact: true }).click();
    await expect(page.getByTestId("interest-match")).toHaveCount(5);
    const second = await page
      .getByTestId("interest-match")
      .locator("h2,h3")
      .allTextContents();
    expect(first).toHaveLength(40);
    expect(second).toHaveLength(5);
    expect(new Set([...first, ...second]).size).toBe(45);
    await page
      .getByRole("link", { name: "Previous page", exact: true })
      .click();
    await expect(page.getByTestId("interest-match")).toHaveCount(40);
    expect(
      await page
        .getByTestId("interest-match")
        .locator("h2,h3")
        .allTextContents(),
    ).toEqual(first);
  } finally {
    await admin
      .from("papers")
      .delete()
      .in(
        "id",
        papers.map((p) => p.id),
      );
  }
});
