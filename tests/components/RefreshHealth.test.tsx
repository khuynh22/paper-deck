import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/corpus/refreshHealth", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/corpus/refreshHealth")>(),
  getRefreshHealth: load,
}));
import { RefreshHealth } from "@/components/RefreshHealth";

test("owner view distinguishes stale successful zero results from failed source", async () => {
  load.mockResolvedValue({
    observedAt: 27 * 3600000,
    history: [{ id: "run", started_at: "1970-01-01T00:00:00Z", status: "running", finished_at: null, error: null }],
    sources: [{ source_id: "arxiv", last_success_at: "1970-01-01T00:00:00Z", last_outcome: { status: "healthy", count: 0, latencyMs: 10, errors: [] } },
      { source_id: "conferences", last_success_at: null, last_outcome: { status: "failed", count: 0, latencyMs: 20, errors: ["ICML: Upstream HTTP 429"] } }],
  });
  const { container } = render(await RefreshHealth());
  expect(container).toHaveTextContent("healthy · stale");
  expect(container).toHaveTextContent("0 papers");
  expect(container).toHaveTextContent("failed (lease expired)");
  expect(screen.getByText("ICML: Upstream HTTP 429")).toBeInTheDocument();
});
test("health loading failure is visible rather than presented as healthy", async () => {
  load.mockRejectedValue(new Error("database detail"));
  render(await RefreshHealth());
  expect(screen.getByRole("status")).toHaveTextContent("Source health is unavailable");
});
