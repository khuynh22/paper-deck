import { test, expect } from "vitest";
import { parseDiscovery, discoveryHref } from "@/lib/corpus/discovery";
const now = new Date("2026-06-06T00:00:00Z");
test("valid filters and a frozen page round-trip through the URL", () => {
  const p = parseDiscovery({ q: "  diffusion ", topic: "cs.AI", venue: "NeurIPS 2024", from: "2026-01-01", to: "2026-06-01", page: "2", tab: "trending", asof: now.toISOString() }, now);
  const href = discoveryHref("/", p);
  expect(parseDiscovery(Object.fromEntries(new URL(href, "https://paper.test").searchParams), now)).toEqual(p);
  expect(p.invalid).toBe(false);
});
test.each([
  { page: "-1" }, { page: "2.5" }, { page: "999999" }, { page: ["1", "2"] },
  { page: "2" }, { asof: "2026-02-30T00:00:00Z" }, { asof: "0000-01-01T00:00:00Z" },
  { from: "2026-02-30" }, { from: "0000-01-01" }, { from: "2026-06-01", to: "2026-01-01" },
  { topic: "cs.AI) OR true" }, { venue: "x".repeat(121) }, { q: ["a", "b"] }, { tab: "unknown" },
])("invalid input safely resets the page: %j", input => {
  const p = parseDiscovery(input, now);
  expect(p.invalid).toBe(true); expect(p.page).toBe(1);
});
test("changing page preserves filters and changing tab can reset page", () => {
  const p = parseDiscovery({ topic: "cs.AI", venue: "A & B" }, now);
  expect(discoveryHref("/", p, { page: 2 })).toContain("venue=A+%26+B");
  expect(discoveryHref("/", { ...p, page: 3 }, { tab: "famous", page: 1 })).not.toContain("page=");
});
