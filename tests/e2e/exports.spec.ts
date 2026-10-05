import { test, expect, admin, authenticate } from "./fixtures";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
test("citation and private notes downloads include every page and reject another user's selection", async ({
  page,
  browser,
  seed,
}) => {
  const papers = Array.from({ length: 1005 }, (_, i) => ({
    id: randomUUID(),
    title: `Export fixture ${i}`,
    authors: ["Zoë 李"],
  }));
  const secret =
    "Private export note <script>alert(1)</script>\n```\nexact content";
  try {
    expect((await admin.from("papers").insert(papers)).error).toBeNull();
    expect(
      (
        await admin
          .from("stars")
          .insert(papers.map((p) => ({ user_id: seed.userId, paper_id: p.id })))
      ).error,
    ).toBeNull();
    expect(
      (
        await admin
          .from("highlights")
          .insert(
            papers.map((p) => ({
              user_id: seed.userId,
              paper_id: p.id,
              block_anchor: "0",
              start_offset: 0,
              end_offset: 7,
              quote: "Passage",
              note: secret,
            })),
          )
      ).error,
    ).toBeNull();
    await page.goto("/library");
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: "Download all library citations",
        exact: true,
      })
      .click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("paper-deck-library.bib");
    const bib = await readFile((await download.path())!, "utf8");
    expect(bib.match(/@misc\{/g)).toHaveLength(1005);
    await page
      .getByText("Select citations from this page", { exact: true })
      .click();
    await page
      .getByRole("region", { name: "Research exports" })
      .getByRole("checkbox")
      .first()
      .check();
    const selectedPromise = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: "Download selected citations (1)",
        exact: true,
      })
      .click();
    expect(
      (await readFile((await (await selectedPromise).path())!, "utf8")).match(
        /@misc\{/g,
      ),
    ).toHaveLength(1);
    await page.goto("/notes");
    const notesPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download all my notes", exact: true })
      .click();
    const notes = await readFile((await (await notesPromise).path())!, "utf8");
    expect(notes.match(/### Saved passage/g)).toHaveLength(1005);
    expect(notes).toContain(secret);
    await page.goto(`/paper/${seed.htmlId}`);
    const singlePromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download BibTeX", exact: true })
      .click();
    expect(
      (await readFile((await (await singlePromise).path())!, "utf8")).match(
        /@misc\{/g,
      ),
    ).toHaveLength(1);
    const email = `export-other-${randomUUID()}@example.test`,
      password = randomUUID() + "Aa1!";
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(created.error).toBeNull();
    const other = await browser.newContext();
    try {
      await authenticate(other, email, password);
      const response = await other.request.post(
        "http://127.0.0.1:3102/api/export",
        { data: { scope: "notes", format: "md" } },
      );
      expect(response.status()).toBe(200);
      expect(await response.text()).not.toContain(secret);
      const selected = await other.request.post(
        "http://127.0.0.1:3102/api/export",
        { data: { scope: "selected", format: "bib", ids: [papers[0].id] } },
      );
      expect(selected.status()).toBe(409);
      const single = await other.request.post(
        "http://127.0.0.1:3102/api/export",
        { data: { scope: "paper", paperId: papers[0].id, format: "md" } },
      );
      expect(await single.text()).not.toContain(secret);
    } finally {
      await other.close();
      await admin.auth.admin.deleteUser(created.data.user!.id);
    }
    const anonymous = await browser.newContext();
    try {
      expect(
        (
          await anonymous.request.post("http://127.0.0.1:3102/api/export", {
            data: { scope: "notes", format: "md" },
          })
        ).status(),
      ).toBe(401);
    } finally {
      await anonymous.close();
    }
  } finally {
    for (let offset = 0; offset < papers.length; offset += 100)
      await admin
        .from("papers")
        .delete()
        .in(
          "id",
          papers.slice(offset, offset + 100).map((p) => p.id),
        );
  }
});
