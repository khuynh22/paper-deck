import { test, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  from: vi.fn(),
  eq: vi.fn(),
  results: [] as { data: unknown[] | null; error: unknown }[],
}));
vi.mock("@/lib/auth", () => ({ currentUser: mocks.user }));
vi.mock("@/lib/db/server", () => ({
  serverClient: async () => ({ from: mocks.from }),
}));
import { POST } from "@/app/api/export/route";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.results = [];
  mocks.user.mockResolvedValue({ id: "owner" });
  mocks.from.mockImplementation(() => {
    const query = {
      select: () => query,
      eq: (...args: unknown[]) => {
        mocks.eq(...args);
        return query;
      },
      order: () => query,
      limit: () => query,
      gt: () => query,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(mocks.results.shift()).then(resolve),
    };
    return query;
  });
});
test("a later export page failure returns an error without an attachment or partial citations", async () => {
  mocks.results = [
    {
      data: Array.from({ length: 1000 }, (_, i) => ({ paper_id: String(i) })),
      error: null,
    },
    { data: null, error: { message: "private database diagnostic" } },
  ];
  const response = await POST(
    new Request("http://localhost/api/export", {
      method: "POST",
      body: JSON.stringify({ scope: "library", format: "bib" }),
    }),
  );
  expect(response.status).toBe(500);
  expect(response.headers.get("Content-Disposition")).toBeNull();
  expect(await response.text()).not.toContain("private database diagnostic");
  expect(mocks.eq).toHaveBeenCalledWith("user_id", "owner");
});
test("anonymous and malformed requests never query private rows", async () => {
  mocks.user.mockResolvedValue(null);
  expect(
    (
      await POST(
        new Request("http://localhost/api/export", {
          method: "POST",
          body: "{}",
        }),
      )
    ).status,
  ).toBe(401);
  mocks.user.mockResolvedValue({ id: "owner" });
  expect(
    (
      await POST(
        new Request("http://localhost/api/export", {
          method: "POST",
          body: '{"scope":"selected","format":"bib","ids":[]}',
        }),
      )
    ).status,
  ).toBe(400);
  expect(mocks.from).not.toHaveBeenCalled();
});
