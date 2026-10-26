import { beforeEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ search: vi.fn(), refresh: vi.fn(), reload: vi.fn() }));
vi.mock("@/app/actions/search", () => ({ searchArxivAction: mocks.search }));
vi.mock("@/app/actions/refresh", () => ({ triggerRefresh: mocks.refresh }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.reload }) }));

import { ExternalSearch } from "@/components/ExternalSearch";
import { RefreshButton } from "@/components/RefreshButton";

beforeEach(() => { vi.clearAllMocks(); });

test("empty arxiv results show an explicit empty state", async () => {
  mocks.search.mockResolvedValue({ error: null, ingestion: { inserted: 0, updated: 0, skipped: 0, failed: 0, unconfirmed: 0 } });
  render(<ExternalSearch query="paper" />);
  fireEvent.click(screen.getByRole("button"));
  expect(await screen.findByText("No new arXiv results.")).toBeInTheDocument();
});

test.each(["search", "refresh"])("%s marks partial failures and unconfirmed outcomes as an error", async kind => {
  const ingestion = { inserted: 3, updated: 0, skipped: 1, failed: 1, unconfirmed: 2 };
  mocks.search.mockResolvedValue({ error: null, ingestion });
  mocks.refresh.mockResolvedValue({ errors: [], ingestion });
  render(kind === "search" ? <ExternalSearch query="paper" /> : <RefreshButton />);
  fireEvent.click(screen.getByRole("button"));
  const feedback = await screen.findByRole("alert");
  expect(feedback).toHaveTextContent("3 added");
  expect(feedback).toHaveTextContent("1 failed");
  expect(feedback).toHaveTextContent("2 unconfirmed");
});

test("a thrown search action gives visible failure feedback", async () => {
  mocks.search.mockRejectedValue(new Error("network"));
  render(<ExternalSearch query="paper" />);
  fireEvent.click(screen.getByRole("button"));
  expect(await screen.findByRole("alert")).toHaveTextContent("arXiv search failed");
});
