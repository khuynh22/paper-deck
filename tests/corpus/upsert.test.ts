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
  rpc.mockResolvedValue({ data: ["inserted", "updated", "skipped", "failed"].map((outcome, input_index) => ({ outcome, input_index, paper_id: null })), error: null });
  expect(await upsertPapers(Array.from({ length: 4 }, (_, i) => base({ arxivId: `a${i}` }))))
    .toEqual({ inserted: 1, updated: 1, skipped: 1, failed: 1, unconfirmed: 0 });
});

test("bounds batches and includes every input beyond one batch", async () => {
  rpc.mockImplementation(async (_name: string, { incoming }: { incoming: unknown[] }) => ({ data: incoming.map((_, input_index) => ({ outcome: "inserted", input_index, paper_id: null })), error: null }));
  expect((await upsertPapers(Array.from({ length: 205 }, (_, i) => base({ arxivId: `a${i}` })))).inserted).toBe(205);
  expect(rpc.mock.calls.map(call => call[1].incoming.length)).toEqual([100, 100, 5]);
});

test.each([
  { data: null, error: { message: "private details" } },
  { data: [], error: null },
  { data: [{ outcome: "unknown" }], error: null },
  { data: [{ outcome: "inserted", input_index: 5 }], error: null },
])("never reports unconfirmed RPC output as success", async response => {
  rpc.mockResolvedValue(response);
  expect(await upsertPapers([base({})])).toEqual({ inserted: 0, updated: 0, skipped: 0, failed: 0, unconfirmed: 1 });
});

test("empty imports do not call the database", async () => {
  expect(await upsertPapers([])).toEqual({ inserted: 0, updated: 0, skipped: 0, failed: 0, unconfirmed: 0 });
  expect(rpc).not.toHaveBeenCalled();
});

test("deduplicates identifier-free papers and strongest signals before batching", async () => {
  rpc.mockImplementation(async (_name: string, { incoming }: { incoming: unknown[] }) => ({ data: incoming.map((_, input_index) => ({ outcome: "inserted", input_index, paper_id: null })), error: null }));
  const result = await upsertPapers([
    base({ arxivId: null, title: "Same Paper", signals: { citations: 10 } }),
    base({ arxivId: null, title: " same   paper ", signals: { citations: 3, hfUpvotes: 0 } }),
  ]);
  expect(result.inserted).toBe(1);
  expect(rpc.mock.calls[0][1].incoming).toEqual([{ title: "Same Paper", citations: 10, hf_upvotes: 0 }]);
});

test("retains confirmed counts and continues after a later transport failure", async () => {
  const cause = { message: "function merge_papers not found", code: "PGRST202" };
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  rpc.mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, input_index) => ({ input_index, outcome: "inserted", paper_id: null })), error: null });
  rpc.mockResolvedValueOnce({ data: null, error: cause });
  rpc.mockResolvedValueOnce({ data: [{ input_index: 0, outcome: "skipped", paper_id: null }], error: null });
  expect(await upsertPapers(Array.from({ length: 201 }, (_, i) => base({ arxivId: `a${i}` }))))
    .toEqual({ inserted: 100, updated: 0, skipped: 1, failed: 0, unconfirmed: 100 });
  expect(JSON.stringify(log.mock.calls)).toContain("PGRST202");
  log.mockRestore();
});

test("does not count a malformed batch twice through duplicate indices", async () => {
  rpc.mockResolvedValue({ data: [0, 0].map(input_index => ({ input_index, outcome: "inserted", paper_id: null })), error: null });
  expect(await upsertPapers([base({ arxivId: "a" }), base({ arxivId: "b" })]))
    .toMatchObject({ inserted: 0, unconfirmed: 2 });
});

test("a thrown transport failure remains unconfirmed", async () => {
  rpc.mockRejectedValue(new Error("connection reset"));
  expect(await upsertPapers([base({})])).toMatchObject({ inserted: 0, failed: 0, unconfirmed: 1 });
});
