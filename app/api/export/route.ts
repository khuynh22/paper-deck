import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { serverClient } from "@/lib/db/server";
import { collectPages } from "@/lib/exports/collect";
import {
  bibtex,
  markdown,
  filename,
  type ExportNote,
} from "@/lib/exports/serialize";
import { passageVerifier } from "@/lib/exports/passage";
import { rowToHighlight, type HighlightRow } from "@/lib/db/highlightRow";
import type { PaperRow } from "@/lib/types";
import { SITE_URL } from "@/lib/site";

const inputSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("paper"),
    paperId: z.uuid(),
    format: z.enum(["bib", "md"]),
  }),
  z.object({ scope: z.literal("library"), format: z.literal("bib") }),
  z.object({
    scope: z.literal("selected"),
    ids: z.array(z.uuid()).min(1).max(1000),
    format: z.literal("bib"),
  }),
  z.object({ scope: z.literal("notes"), format: z.literal("md") }),
]);
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
export async function POST(request: Request) {
  try {
    const user = await currentUser();
    if (!user)
      return Response.json(
        { error: "Sign in to export your research." },
        { status: 401, headers },
      );
    const parsed = inputSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      return Response.json(
        { error: "Invalid export selection." },
        { status: 400, headers },
      );
    const input = parsed.data,
      db = await serverClient();
    let ids: string[] = [],
      highlights: HighlightRow[] = [];
    if (input.scope === "paper") ids = [input.paperId];
    else if (input.scope === "library" || input.scope === "selected") {
      const saved = await collectPages<{ paper_id: string }>(
        async (after) => {
          let query = db
            .from("stars")
            .select("paper_id")
            .eq("user_id", user.id)
            .order("paper_id")
            .limit(1000);
          if (after) query = query.gt("paper_id", after);
          return await query;
        },
        (row) => row.paper_id,
      );
      const owned = new Set(saved.map((row) => row.paper_id));
      if (input.scope === "selected") {
        ids = [...new Set(input.ids)];
        if (ids.some((id) => !owned.has(id)))
          return Response.json(
            {
              error:
                "Some selected papers are no longer in your library. Refresh and try again.",
            },
            { status: 409, headers },
          );
      } else ids = [...owned];
    }
    if (input.format === "md") {
      highlights = await collectPages<HighlightRow>(
        async (after) => {
          let query = db
            .from("highlights")
            .select(
              "id,paper_id,block_anchor,start_offset,end_offset,quote,note",
            )
            .eq("user_id", user.id)
            .order("id")
            .limit(1000);
          if (input.scope === "paper")
            query = query.eq("paper_id", input.paperId);
          if (after) query = query.gt("id", after);
          return await query;
        },
        (row) => row.id,
      );
      if (input.scope === "notes")
        ids = [...new Set(highlights.map((h) => h.paper_id))];
    }
    const papers: PaperRow[] = [],
      notes: ExportNote[] = [];
    for (let offset = 0; offset < ids.length; offset += 100) {
      const batch = ids.slice(offset, offset + 100),
        result = await db
          .from("papers")
          .select("*")
          .in("id", batch)
          .order("id");
      if (result.error || result.data?.length !== batch.length)
        throw new Error("Requested papers could not all be read");
      papers.push(...(result.data as PaperRow[]));
      if (input.format === "md") {
        const content = await db
          .from("paper_content")
          .select("paper_id,sanitized_html")
          .in("paper_id", batch);
        if (content.error) throw content.error;
        const byPaper = new Map(
          (content.data ?? []).map((row) => [row.paper_id, row.sanitized_html]),
        );
        for (const id of batch) {
          const valid = passageVerifier(byPaper.get(id) ?? null);
          for (const row of highlights.filter((h) => h.paper_id === id)) {
            const highlight = rowToHighlight(row);
            notes.push({ highlight, passageValid: valid(highlight) });
          }
        }
      }
    }
    papers.sort((a, b) => a.id.localeCompare(b.id));
    const output =
      input.format === "bib"
        ? bibtex(papers, SITE_URL)
        : markdown(papers, notes, SITE_URL);
    const label =
      input.scope === "paper"
        ? papers[0].title
        : input.scope === "notes"
          ? "paper-deck-notes"
          : "paper-deck-library";
    return new Response(output, {
      headers: {
        ...headers,
        "Content-Type":
          input.format === "bib"
            ? "application/x-bibtex; charset=utf-8"
            : "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename(label, input.format)}"`,
      },
    });
  } catch {
    return Response.json(
      { error: "Export failed. No partial file was generated. Please retry." },
      { status: 500, headers },
    );
  }
}
