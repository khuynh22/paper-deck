export async function collectPages<T>(
  fetchPage: (
    after: string | undefined,
  ) => Promise<{ data: T[] | null; error: unknown }>,
  key: (row: T) => string,
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | undefined;
  for (;;) {
    const result = await fetchPage(after);
    if (result.error) throw result.error;
    const page = result.data ?? [];
    if (!page.length) return rows;
    const next = key(page[page.length - 1]);
    if (next === after) throw new Error("Export pagination made no progress");
    rows.push(...page);
    after = next;
  }
}
