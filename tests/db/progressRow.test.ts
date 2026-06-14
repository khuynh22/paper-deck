import { test, expect } from "vitest";
import { buildProgressRow } from "@/lib/db/progressRow";

const NOW = "2026-06-12T00:00:00.000Z";

test("omits status on a scroll-only save so a finished paper isn't downgraded to reading", () => {
  // A debounced scroll save carries no status. It must NOT write one, or the
  // upsert clobbers a previously-saved 'done' back to 'reading'.
  const row = buildProgressRow("u1", "p1", { scrollPct: 0.5, blockAnchor: "3", readerKind: "html" }, NOW);
  expect(row).not.toHaveProperty("status");
  expect(row.scroll_pct).toBe(0.5);
  expect(row.block_anchor).toBe("3");
});

test("writes status only when explicitly provided", () => {
  const row = buildProgressRow("u1", "p1", { status: "done", markedAnchor: "9" }, NOW);
  expect(row.status).toBe("done");
  expect(row.marked_anchor).toBe("9");
});

test("only includes the fields present in the update", () => {
  const row = buildProgressRow("u1", "p1", { scrollPct: 0.1 }, NOW);
  expect(row).toEqual({ user_id: "u1", paper_id: "p1", updated_at: NOW, scroll_pct: 0.1 });
});

test("writes read_pct only when provided", () => {
  expect(buildProgressRow("u1", "p1", { readPct: 0.42 }, NOW).read_pct).toBe(0.42);
  expect(buildProgressRow("u1", "p1", { scrollPct: 0.1 }, NOW)).not.toHaveProperty("read_pct");
});
