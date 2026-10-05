import { test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
const exchange = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/server", () => ({ serverClient: async () => ({ auth: { exchangeCodeForSession: exchange } }) }));
import { GET } from "@/app/auth/callback/route";

beforeEach(() => { exchange.mockReset(); exchange.mockResolvedValue({ error: null }); });
test("exchanges the callback code before returning to the requested local page", async () => {
  const result = await GET(new NextRequest("https://paper.test/auth/callback?code=test-code&next=/library"));
  expect(exchange).toHaveBeenCalledExactlyOnceWith("test-code");
  expect(result.headers.get("location")).toBe("https://paper.test/library");
});
test("missing or rejected codes do not redirect to an authenticated page", async () => {
  expect((await GET(new NextRequest("https://paper.test/auth/callback"))).headers.get("location")).toBe("https://paper.test/login?error=auth");
  expect(exchange).not.toHaveBeenCalled();
  exchange.mockResolvedValue({ error: { message: "invalid code" } });
  expect((await GET(new NextRequest("https://paper.test/auth/callback?code=bad&next=/library"))).headers.get("location")).toBe("https://paper.test/login?error=auth");
});
test.each(["@evil.test", "//evil.test", "/\\evil.test", "https://evil.test"])("rejects an external callback destination: %s", async next => {
  const result = await GET(new NextRequest(`https://paper.test/auth/callback?code=test-code&next=${encodeURIComponent(next)}`));
  expect(result.headers.get("location")).toBe("https://paper.test/");
});
