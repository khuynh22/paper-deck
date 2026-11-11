// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  service: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  serverClient: async () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === "papers"
              ? { id: "paper", title: "Paper", arxiv_id: "1706.03762", pdf_url: null }
              : null,
            error: null,
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/db/service", () => ({ serviceClient: mocks.service }));
vi.mock("@/lib/db/paperIdentity", () => ({ resolvePaperId: async () => "paper" }));
vi.mock("@/lib/reader/fetchHtml", () => ({
  loadReaderHtml: async () => ({ kind: "html", html: "<article>Reader content</article>" }),
}));

import { GET } from "@/app/api/reader/[id]/route";

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.upsert.mockReset().mockResolvedValue({ error: null });
  mocks.service.mockReset().mockReturnValue({ from: () => ({ upsert: mocks.upsert }) });
});

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
  expect(await response.json()).toMatchObject({ kind: "html", html: "<article>Reader content</article>" });
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
