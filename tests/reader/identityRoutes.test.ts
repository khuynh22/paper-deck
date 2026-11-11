// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(async () => "canonical"),
  paper: vi.fn(async () => ({ id: "canonical", title: "Preserved" })),
  from: vi.fn(),
  progress: vi.fn(),
  highlights: vi.fn(),
}));
vi.mock("@/lib/db/server", () => ({ serverClient: async () => ({ from: mocks.from }) }));
vi.mock("@/lib/db/paperIdentity", () => ({ resolvePaperId: mocks.resolve }));
vi.mock("@/lib/corpus/query", () => ({ getPaper: mocks.paper }));
vi.mock("@/lib/auth", () => ({ currentUser: async () => ({ id: "user" }) }));
vi.mock("@/app/actions/progress", () => ({ loadProgress: mocks.progress }));
vi.mock("@/app/actions/highlights", () => ({ loadHighlights: mocks.highlights }));
vi.mock("@/components/ReaderView", () => ({ ReaderView: () => null }));
vi.mock("@/components/StarButton", () => ({ StarButton: () => null }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error("redirect " + url); },
  notFound: () => { throw new Error("not found"); },
}));

import { GET } from "@/app/api/reader/[id]/route";
import ReaderPage from "@/app/reader/[id]/page";
import PaperPage from "@/app/paper/[id]/page";

beforeEach(() => vi.clearAllMocks());

test("an old API URL redirects to the canonical paper while preserving the PDF option", async () => {
  const response = await GET(new NextRequest("http://localhost/api/reader/old?pdf=1"), { params: Promise.resolve({ id: "old" }) });
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("http://localhost/api/reader/canonical?pdf=1");
  expect(mocks.from).not.toHaveBeenCalled();
});

test("old reader bookmarks redirect before loading state or rendering stale IDs", async () => {
  await expect(ReaderPage({ params: Promise.resolve({ id: "old" }) })).rejects.toThrow("redirect /reader/canonical");
  expect(mocks.progress).not.toHaveBeenCalled();
  expect(mocks.highlights).not.toHaveBeenCalled();
});

test("old paper detail links redirect to the preserved corpus identity", async () => {
  await expect(PaperPage({ params: Promise.resolve({ id: "old" }) })).rejects.toThrow("redirect /paper/canonical");
});
