import { isUuid } from "@/lib/library/params";
import { MAX_PAGE } from "@/lib/corpus/discovery";
export interface NotesParams {
  q: string;
  paper: string;
  page: number;
  invalid: boolean;
}
export interface NoteRow {
  id: string;
  paper_id: string;
  paper_title: string;
  quote: string;
  note: string | null;
  updated_at: string;
  block_anchor: string;
  start_offset: number;
  end_offset: number;
}
export function parseNotes(
  input: Record<string, string | string[] | undefined>,
): NotesParams {
  let invalid = false;
  const text = (key: string, max: number) => {
    const value = input[key];
    if (value === undefined) return "";
    if (
      typeof value !== "string" ||
      value.length > max ||
      /[\u0000-\u001f\u007f]/.test(value)
    ) {
      invalid = true;
      return "";
    }
    return value.trim();
  };
  const q = text("q", 300);
  let paper = text("paper", 36).toLowerCase();
  const rawPage = text("page", 8);
  let page = rawPage ? Number(rawPage) : 1;
  if (paper && !isUuid(paper)) {
    invalid = true;
    paper = "";
  }
  if (
    (rawPage && !/^[1-9]\d*$/.test(rawPage)) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > MAX_PAGE
  ) {
    invalid = true;
    page = 1;
  }
  return { q, paper, page: invalid ? 1 : page, invalid };
}
export function notesHref(
  params: NotesParams,
  changes: Partial<NotesParams> = {},
) {
  const p = { ...params, ...changes },
    query = new URLSearchParams();
  if (p.q) query.set("q", p.q);
  if (p.paper) query.set("paper", p.paper);
  if (p.page > 1) query.set("page", String(p.page));
  return `/notes${query.size ? `?${query}` : ""}`;
}
