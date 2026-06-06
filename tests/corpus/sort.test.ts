import { test, expect } from "vitest";
import { trendingScore } from "@/lib/corpus/query";

const now = Date.parse("2026-06-06T00:00:00Z");

test("recent paper outranks an old paper with identical signals", () => {
  const fresh = trendingScore(
    { hf_upvotes: 10, pwc_stars: 100, published_at: "2026-06-05T00:00:00Z" },
    now,
  );
  const old = trendingScore(
    { hf_upvotes: 10, pwc_stars: 100, published_at: "2020-01-01T00:00:00Z" },
    now,
  );
  expect(fresh).toBeGreaterThan(old);
});

test("more upvotes increases the score at equal recency", () => {
  const a = trendingScore({ hf_upvotes: 50, pwc_stars: 0, published_at: "2026-06-05T00:00:00Z" }, now);
  const b = trendingScore({ hf_upvotes: 5, pwc_stars: 0, published_at: "2026-06-05T00:00:00Z" }, now);
  expect(a).toBeGreaterThan(b);
});

test("missing published date does not throw and yields a finite score", () => {
  const s = trendingScore({ hf_upvotes: 1, pwc_stars: 1, published_at: null }, now);
  expect(Number.isFinite(s)).toBe(true);
});
