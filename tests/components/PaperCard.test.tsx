import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaperCard } from "@/components/PaperCard";
import type { PaperRow } from "@/lib/types";

// Avoid importing the server action chain (next/headers) in jsdom.
vi.mock("@/app/actions/star", () => ({ toggleStar: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const paper: PaperRow = {
  id: "p1",
  arxiv_id: "2401.123",
  doi: null,
  title: "Deep Nets at Scale",
  authors: ["A One", "B Two", "C Three", "D Four"],
  abstract: "We scale deep nets.",
  categories: ["cs.LG", "cs.AI"],
  html_url: null,
  pdf_url: null,
  source_url: null,
  published_at: "2024-03-01T00:00:00Z",
  hf_upvotes: 12,
  pwc_stars: 0,
  citations: 42,
};

test("renders the title linking to the paper detail", () => {
  render(<PaperCard paper={paper} starred={false} />);
  expect(screen.getByRole("link", { name: "Deep Nets at Scale" })).toHaveAttribute(
    "href",
    "/paper/p1",
  );
});

test("truncates the author list to three plus et al.", () => {
  render(<PaperCard paper={paper} starred={false} />);
  expect(screen.getByText("A One, B Two, C Three et al.")).toBeInTheDocument();
});

test("shows a Read link to the reader", () => {
  render(<PaperCard paper={paper} starred={false} />);
  expect(screen.getByRole("link", { name: /read/i })).toHaveAttribute("href", "/reader/p1");
});

test("shows one signal — citations win over upvotes", () => {
  render(<PaperCard paper={paper} starred={false} />);
  expect(screen.getByText("42 citations")).toBeInTheDocument();
  expect(screen.queryByText(/▲/)).not.toBeInTheDocument();
});

test("falls back to upvotes, then 'new', when citations are zero", () => {
  const { rerender } = render(
    <PaperCard paper={{ ...paper, citations: 0 }} starred={false} />,
  );
  expect(screen.getByText("▲ 12")).toBeInTheDocument();

  rerender(<PaperCard paper={{ ...paper, citations: 0, hf_upvotes: 0 }} starred={false} />);
  expect(screen.getByText("new")).toBeInTheDocument();
});

test("reflects saved state via aria-pressed", () => {
  render(<PaperCard paper={paper} starred />);
  expect(screen.getByRole("button", { name: /remove from library/i })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("shows reading progress when started", () => {
  render(<PaperCard paper={paper} starred={false} progressPct={0.34} />);
  expect(screen.getByText("34%")).toBeInTheDocument();
});
