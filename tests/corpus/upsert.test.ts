import { test, expect, vi, beforeEach } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/db/service", () => ({ serviceClient: () => ({ rpc }) }));
import { toPaperRow, upsertPapers } from "@/lib/corpus/upsert";
import type { NormalizedPaper } from "@/lib/types";

const base = (o: Partial<NormalizedPaper>): NormalizedPaper => ({
  arxivId: "2401.1",
  doi: null,
  title: "T",
  authors: [],
  abstract: null,
  categories: [],
  htmlUrl: null,
  pdfUrl: null,
  sourceUrl: null,
  publishedAt: null,
  signals: {},
  ...o,
});

test("maps a venue when present", () => {
  expect(toPaperRow(base({ venue: "NeurIPS 2024" })).venue).toBe("NeurIPS 2024");
});

test("omits unknown fields instead of erasing enrichment", () => {
  expect(toPaperRow(base({}))).toEqual({ arxiv_id: "2401.1", title: "T" });
});

beforeEach(() => { rpc.mockReset(); });

test("preserves explicit zero and normalizes DOI", () => {
  expect(toPaperRow(base({ doi: " 10.1/ABC ", signals: { citations: 0, hfUpvotes: 0 } })))
    .toMatchObject({ doi: "10.1/abc", citations: 0, hf_upvotes: 0 });
});

test("counts each database-confirmed outcome including failed and unchanged rows", async () => {
  rpc.mockResolvedValue({ data: ["inserted", "updated", "skipped", "failed"].map(outcome => ({ outcome })), error: null });
  expect(await upsertPapers(Array.from({ length: 4 }, () => base({}))))
    .toEqual({ inserted: 1, updated: 1, skipped: 1, failed: 1 });
  expect(rpc).toHaveBeenCalledWith("merge_papers", { incoming: Array.from({ length: 4 }, () => ({ arxiv_id: "2401.1", title: "T" })) });
});

test("bounds batches and includes every input beyond one batch", async () => {
  rpc.mockImplementation(async (_name: string, { incoming }: { incoming: unknown[] }) => ({ data: incoming.map(() => ({ outcome: "inserted" })), error: null }));
  expect((await upsertPapers(Array.from({ length: 205 }, () => base({})))).inserted).toBe(205);
  expect(rpc.mock.calls.map(call => call[1].incoming.length)).toEqual([100, 100, 5]);
});

test.each([
  { data: null, error: { message: "private details" } },
  { data: [], error: null },
  { data: [{ outcome: "unknown" }], error: null },
])("never reports unconfirmed RPC output as success", async response => {
  rpc.mockResolvedValue(response);
  await expect(upsertPapers([base({})])).rejects.toThrow(/import/i);
});

test("empty imports do not call the database", async () => {
  expect(await upsertPapers([])).toEqual({ inserted: 0, updated: 0, skipped: 0, failed: 0 });
  expect(rpc).not.toHaveBeenCalled();
});
