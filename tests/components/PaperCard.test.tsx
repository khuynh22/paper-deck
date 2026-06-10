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

test("renders citation and upvote signals but hides zero ones", () => {
  render(<PaperCard paper={paper} starred={false} />);
  expect(screen.getByText(/★ 42/)).toBeInTheDocument();
  expect(screen.getByText(/▲ 12/)).toBeInTheDocument();
  expect(screen.queryByText(/⌥/)).not.toBeInTheDocument(); // pwc_stars is 0
});

test("reflects starred state via aria-pressed", () => {
  render(<PaperCard paper={paper} starred />);
  expect(screen.getByRole("button", { name: /remove star/i })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
