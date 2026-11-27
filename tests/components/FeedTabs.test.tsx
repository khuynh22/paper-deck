import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeedTabs } from "@/components/FeedTabs";
import { parseDiscovery } from "@/lib/corpus/discovery";

test("the Trending hint links to the Hugging Face papers page", () => {
  render(<FeedTabs active="trending" />);
  const link = screen.getByRole("link", { name: /ranked by community upvotes/i });
  expect(link).toHaveAttribute("href", "https://huggingface.co/papers");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noreferrer");
});

test("non-trending hints are plain text, not links", () => {
  render(<FeedTabs active="latest" />);
  const hint = screen.getByText("freshest arXiv submissions");
  expect(hint.closest("a")).toBeNull();

  render(<FeedTabs active="famous" />);
  const famousHint = screen.getByText("ranked by citations");
  expect(famousHint.closest("a")).toBeNull();
});

test("changing feed order preserves filters and resets paging", () => {
  const params = parseDiscovery({ topic: "cs.AI", venue: "TestConf", page: "3", asof: "2026-06-06T00:00:00Z" });
  render(<FeedTabs active="latest" params={params} />);
  const target = new URL(screen.getByRole("link", { name: "Trending" }).getAttribute("href")!, "https://paper.test");
  expect(target.searchParams.get("topic")).toBe("cs.AI");
  expect(target.searchParams.get("venue")).toBe("TestConf");
  expect(target.searchParams.has("page")).toBe(false);
  expect(target.searchParams.get("asof")).toBe(params.asOf);
});
