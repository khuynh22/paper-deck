import { serverClient } from "@/lib/db/server";
import {
  PAGE_SIZE,
  type LibraryParams,
  type LibraryItem,
  type Collection,
} from "./params";

export async function getLibraryPage(params: LibraryParams) {
  const db = await serverClient();
  const { data, error } = await db.rpc("library_papers", {
    query_text: params.q,
    status_filter: params.status,
    sort_mode: params.sort,
    selected_collection: params.collection || null,
    page_limit: PAGE_SIZE + 1,
    page_offset: (params.page - 1) * PAGE_SIZE,
  });
  if (error) throw error;
  const rows = (data ?? []) as LibraryItem[];
  return { items: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE };
}
export async function getCollections(userId: string): Promise<Collection[]> {
  const db = await serverClient();
  const result: Collection[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from("collections")
      .select("id,name")
      .eq("user_id", userId)
      .order("name")
      .order("id")
      .range(offset, offset + 999);
    if (error) throw error;
    result.push(...((data ?? []) as Collection[]));
    if (!data || data.length < 1000) return result;
  }
}
