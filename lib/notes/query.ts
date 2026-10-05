import { serverClient } from "@/lib/db/server";
import { PAGE_SIZE } from "@/lib/corpus/discovery";
import type { NotesParams, NoteRow } from "./params";
export async function getNotesPage(params: NotesParams) {
  const db = await serverClient();
  const { data, error } = await db.rpc("my_notes", {
    query_text: params.q,
    selected_paper: params.paper || null,
    page_limit: PAGE_SIZE + 1,
    page_offset: (params.page - 1) * PAGE_SIZE,
  });
  if (error) throw error;
  const rows = (data ?? []) as NoteRow[];
  return { notes: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
}
export async function getNotePapers() {
  const db = await serverClient(),
    papers: { id: string; title: string }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .rpc("my_note_papers")
      .order("title")
      .order("id")
      .range(offset, offset + 999);
    if (error) throw error;
    papers.push(...(data ?? []));
    if (!data || data.length < 1000) return papers;
  }
}
