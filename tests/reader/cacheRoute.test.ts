// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  update: vi.fn(),
  service: vi.fn(),
  readCache: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  serverClient: async () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === "papers"
              ? { id: "paper", title: "Paper", arxiv_id: "1706.03762", pdf_url: null }
              : mocks.readCache(),
            error: null,
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/db/service", () => ({ serviceClient: mocks.service }));
vi.mock("@/lib/db/paperIdentity", () => ({ resolvePaperId: async () => "paper" }));
import { GET } from "@/app/api/reader/[id]/route";

const prefix = `<h1>Reader content</h1><!--${"fixture ".repeat(260)}-->`;
const oldHtml = '<article><h1 data-blk="0">Reader content</h1><figure data-blk="1">Caption</figure><p data-blk="2">Saved passage.</p></article>';
const newHtml = '<article><h1 data-blk="0">Reader content</h1><figure data-blk="1"><img src="https://arxiv.org/html/1706.03762v1/diagram.svg" alt="" />Caption</figure><p data-blk="2">Saved passage.</p></article>';
const sourceHtml = `<article>${prefix}<figure><object type="image/svg+xml" data="1706.03762v1/diagram.svg"></object>Caption</figure><p>Saved passage.</p></article>`;
const versionedUrl = "https://arxiv.org/html/1706.03762v1";
const cachedAt = "2026-11-09T20:00:00.000Z";

function upstreamHtml(html: string) {
  return { ok: true, url: versionedUrl, text: async () => html };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstreamHtml(sourceHtml)));
  mocks.readCache.mockReset().mockReturnValue(null);
  mocks.upsert.mockReset().mockResolvedValue({ error: null });
  mocks.update.mockReset().mockResolvedValue({ error: null });
  mocks.service.mockReset().mockReturnValue({
    from: () => ({
      upsert: mocks.upsert,
      update: (row: Record<string, string>) => ({
        eq: (column: string, value: string) => ({
          eq: (revision: string, fetchedAt: string) => mocks.update(row, { [column]: value, [revision]: fetchedAt }),
        }),
      }),
    }),
  });
});

afterEach(() => vi.unstubAllGlobals());

function loadReader() {
  return GET(new NextRequest("http://localhost/api/reader/paper"), {
    params: Promise.resolve({ id: "paper" }),
  });
}

test("keeps the request open until the HTML cache write finishes", async () => {
  let finishWrite!: (result: { error: null }) => void;
  mocks.upsert.mockImplementation(() => new Promise((resolve) => { finishWrite = resolve; }));
  let responded = false;
  const pending = loadReader().then((response) => { responded = true; return response; });

  await vi.waitFor(() => expect(mocks.upsert).toHaveBeenCalled());
  expect(responded).toBe(false);
  finishWrite({ error: null });

  const response = await pending;
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ kind: "html", html: newHtml });
});

test("logs a rejected cache write while still serving the reader", async () => {
  const error = { code: "42501", message: "Cache write denied" };
  mocks.upsert.mockResolvedValue({ error });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});

  const response = await loadReader();

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ kind: "html" });
  expect(log).toHaveBeenCalledWith("reader: html cache write failed", error);
});

test("serves HTML when the service client is unavailable", async () => {
  const error = new Error("Service key unavailable");
  mocks.service.mockImplementation(() => { throw error; });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});

  const response = await loadReader();

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ kind: "html" });
  expect(log).toHaveBeenCalledWith("reader: html cache write failed", error);
});

test("repairs an existing cache and serves the repaired HTML on later requests", async () => {
  mocks.readCache.mockReturnValue({ kind: "html", sanitized_html: oldHtml, fetched_at: cachedAt });
  mocks.update.mockImplementation(async (row) => {
    mocks.readCache.mockReturnValue(row);
    return { error: null };
  });

  expect(await (await loadReader()).json()).toMatchObject({ kind: "html", html: newHtml });
  expect(await (await loadReader()).json()).toMatchObject({ kind: "html", html: newHtml });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(mocks.update).toHaveBeenCalledOnce();
  expect(mocks.update).toHaveBeenCalledWith(expect.anything(), { paper_id: "paper", fetched_at: cachedAt });
});

test("keeps saved anchors on the cached HTML when the upstream passage changes", async () => {
  mocks.readCache.mockReturnValue({ kind: "html", sanitized_html: oldHtml, fetched_at: cachedAt });
  mocks.update.mockImplementation(async (row) => {
    mocks.readCache.mockReturnValue(row);
    return { error: null };
  });
  vi.mocked(fetch).mockResolvedValue(upstreamHtml(sourceHtml.replace("Saved passage.", "Changed passage.")) as Response);

  expect(await (await loadReader()).json()).toMatchObject({ kind: "html", html: oldHtml });
  expect(await (await loadReader()).json()).toMatchObject({ kind: "html", html: oldHtml });
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("serves a stale cache during upstream failure and tries again on the next read", async () => {
  mocks.readCache.mockReturnValue({ kind: "html", sanitized_html: oldHtml, fetched_at: cachedAt });
  vi.mocked(fetch).mockRejectedValue(new Error("Upstream unavailable"));

  expect(await (await loadReader()).json()).toMatchObject({ kind: "html", html: oldHtml });
  expect(mocks.update).not.toHaveBeenCalled();

  vi.mocked(fetch).mockResolvedValue(upstreamHtml(sourceHtml) as Response);
  expect(await (await loadReader()).json()).toMatchObject({ kind: "html", html: newHtml });
});
