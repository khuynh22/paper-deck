import { test, expect } from "vitest";
import { resolveSiteUrl, paperPath, paperUrl, SITE_URL } from "@/lib/site";

test("explicit NEXT_PUBLIC_SITE_URL wins and is trailing-slash normalized", () => {
  expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://ppdeck.com/" })).toBe("https://ppdeck.com");
});

test("falls back to the Vercel production domain", () => {
  expect(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "paper-deck.vercel.app" })).toBe(
    "https://paper-deck.vercel.app",
  );
});

test("explicit takes precedence over Vercel", () => {
  expect(
    resolveSiteUrl({
      NEXT_PUBLIC_SITE_URL: "https://ppdeck.com",
      VERCEL_PROJECT_PRODUCTION_URL: "paper-deck.vercel.app",
    }),
  ).toBe("https://ppdeck.com");
});

test("defaults to localhost in dev", () => {
  expect(resolveSiteUrl({})).toBe("http://localhost:3000");
});

test("a malformed value (e.g. missing scheme) falls back to localhost, never throws", () => {
  expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "ppdeck.com" })).toBe("http://localhost:3000");
  expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "not a url" })).toBe("http://localhost:3000");
});

test("paperPath / paperUrl shape", () => {
  expect(paperPath("abc")).toBe("/paper/abc");
  expect(paperUrl("abc")).toBe(`${SITE_URL}/paper/abc`);
});
