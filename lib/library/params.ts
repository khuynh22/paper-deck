import type { PaperRow, ReadingStatus } from "@/lib/types";
import { MAX_PAGE, PAGE_SIZE } from "@/lib/corpus/discovery";
export { MAX_PAGE, PAGE_SIZE };
export const STATUS_LABELS = {
  to_read: "To read",
  reading: "Reading",
  done: "Done",
} as const;
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export interface Collection {
  id: string;
  name: string;
}
export interface LibraryItem {
  paper: PaperRow;
  reading_status: ReadingStatus;
  read_pct: number;
  collection_ids: string[];
}
export interface LibraryParams {
  q: string;
  status: "" | ReadingStatus;
  sort: "newest" | "oldest" | "title";
  collection: string;
  page: number;
  invalid: boolean;
}
export function parseLibrary(
  input: Record<string, string | string[] | undefined>,
): LibraryParams {
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
  let status = text("status", 20),
    sort = text("sort", 20) || "newest",
    collection = text("collection", 36);
  if (status && !Object.hasOwn(STATUS_LABELS, status)) {
    invalid = true;
    status = "";
  }
  if (!["newest", "oldest", "title"].includes(sort)) {
    invalid = true;
    sort = "newest";
  }
  if (collection && !isUuid(collection)) {
    invalid = true;
    collection = "";
  }
  collection = collection.toLowerCase();
  const rawPage = text("page", 8);
  let page = rawPage ? Number(rawPage) : 1;
  if (
    (rawPage && !/^[1-9]\d*$/.test(rawPage)) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > MAX_PAGE
  ) {
    invalid = true;
    page = 1;
  }
  if (invalid) page = 1;
  return {
    q,
    status: status as LibraryParams["status"],
    sort: sort as LibraryParams["sort"],
    collection,
    page,
    invalid,
  };
}
export function libraryHref(
  params: LibraryParams,
  changes: Partial<LibraryParams> = {},
) {
  const p = { ...params, ...changes };
  const query = new URLSearchParams();
  for (const key of ["q", "status", "collection"] as const)
    if (p[key]) query.set(key, p[key]);
  if (p.sort !== "newest") query.set("sort", p.sort);
  if (p.page > 1) query.set("page", String(p.page));
  return `/library${query.size ? `?${query}` : ""}`;
}
