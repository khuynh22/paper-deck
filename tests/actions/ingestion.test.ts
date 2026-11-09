import { beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), merge: vi.fn(), aggregate: vi.fn(), search: vi.fn(), revalidate: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/db/service", () => ({ serviceClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/sources", () => ({ aggregate: mocks.aggregate }));
vi.mock("@/lib/sources/arxiv", () => ({ searchArxiv: mocks.search }));
vi.mock("@/lib/auth", () => ({ currentUser: mocks.user }));
vi.mock("@/lib/env", () => ({ env: () => ({ CRON_SECRET: "test-secret" }), isOwner: (email: string) => email === "owner@example.test" }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { GET } from "@/app/api/cron/refresh/route";
import { triggerRefresh } from "@/app/actions/refresh";
import { searchArxivAction } from "@/app/actions/search";
import type { NormalizedPaper } from "@/lib/types";

const papers = Array.from({ length: 101 }, (_, i): NormalizedPaper => ({
  arxivId: `a${i}`, doi: null, title: `Paper ${i}`, authors: [], abstract: null,
  categories: [], htmlUrl: null, pdfUrl: null, sourceUrl: null, publishedAt: null, signals: {},
}));
const req = () => new NextRequest("http://localhost/api/cron/refresh", { headers: { authorization: "Bearer test-secret" } });
const outcome = (count: number) => ({ id: "arxiv", status: "healthy", count, errors: [] });

function request(result: unknown) {
  const promise = Promise.resolve(result);
  return Object.assign(promise, { abortSignal: () => promise });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockReset();
  mocks.merge.mockReset();
  mocks.rpc.mockImplementation((name, args) => {
    if (name === "begin_refresh") return request({ data: [{ run_id: "test-run", reason: "started" }], error: null });
    if (name === "finish_refresh") return request({ data: true, error: null });
    return request(mocks.merge(name, args));
  });
  mocks.user.mockResolvedValue({ email: "owner@example.test" });
  mocks.aggregate.mockResolvedValue({ results: papers.slice(0, 2), errors: [], outcomes: [outcome(2)] });
  mocks.search.mockResolvedValue(papers);
});

test("cron reports mixed record failures as partial success", async () => {
  mocks.merge.mockResolvedValue({ data: [{ input_index: 0, paper_id: null, outcome: "inserted" }, { input_index: 1, paper_id: null, outcome: "failed" }], error: null });
  const response = await GET(req());
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ status: "partial", ingestion: { inserted: 1, failed: 1 } });
});

test("cron keeps total record failure as an outage", async () => {
  mocks.merge.mockResolvedValue({ data: [0, 1].map(input_index => ({ input_index, paper_id: null, outcome: "failed" })), error: null });
  const response = await GET(req());
  expect(response.status).toBe(503);
  expect((await response.json()).status).toBe("failed");
});

test("cron keeps transport failures visible as an outage", async () => {
  mocks.merge.mockResolvedValue({ data: null, error: { message: "database unavailable" } });
  const response = await GET(req());
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ status: "failed", ingestion: { unconfirmed: 2 } });
});

test.each(["refresh", "search"])("%s invalidates caches and reports earlier saves after a later batch fails", async kind => {
  mocks.aggregate.mockResolvedValue({ results: papers, errors: [], outcomes: [outcome(papers.length)] });
  mocks.merge.mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, input_index) => ({ input_index, paper_id: null, outcome: "inserted" })), error: null });
  mocks.merge.mockResolvedValueOnce({ data: null, error: { message: "connection lost; api_key=private" } });
  const result = kind === "refresh" ? await triggerRefresh() : await searchArxivAction("paper");
  expect(result.ingestion).toMatchObject({ inserted: 100, unconfirmed: 1 });
  expect(mocks.revalidate).toHaveBeenCalledWith("/feed");
  expect(mocks.revalidate).toHaveBeenCalledWith("/search");
  if (kind === "refresh") {
    expect(result).toMatchObject({ status: "partial" });
    const saved = mocks.rpc.mock.calls.find(([name]) => name === "finish_refresh")?.[1];
    expect(saved).toMatchObject({ final_status: "partial", counts: { inserted: 100, unconfirmed: 1 } });
    expect(JSON.stringify(saved)).not.toContain("private");
  }
});

test.each([false, true])("cron distinguishes valid empty responses from all-source failure (%s)", async failed => {
  mocks.aggregate.mockResolvedValue({ results: [], errors: failed ? [{ id: "arxiv", error: "Upstream timeout" }] : [],
    outcomes: [{ ...outcome(0), status: failed ? "failed" : "healthy" }] });
  const response = await GET(req());
  expect(response.status).toBe(failed ? 503 : 200);
  expect((await response.json()).status).toBe(failed ? "failed" : "healthy");
  expect(mocks.merge).not.toHaveBeenCalled();
});

test.each(["busy", "cooldown"])("a %s claim prevents provider calls and database writes", async reason => {
  mocks.rpc.mockImplementation(() => request({ data: [{ run_id: null, reason }], error: null }));
  const response = await GET(req());
  expect(response.status).toBe(409);
  expect((await response.json()).status).toBe(reason);
  expect(mocks.aggregate).not.toHaveBeenCalled();
  expect(mocks.merge).not.toHaveBeenCalled();
});

test("unauthorized cron and manual refresh cannot write", async () => {
  expect((await GET(new NextRequest("http://localhost/api/cron/refresh"))).status).toBe(401);
  mocks.user.mockResolvedValue(null);
  await expect(triggerRefresh()).rejects.toThrow("owner only");
  expect(await searchArxivAction("paper")).toMatchObject({ error: expect.stringContaining("Sign in") });
  expect(mocks.rpc).not.toHaveBeenCalled();
});
