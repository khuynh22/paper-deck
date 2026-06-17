import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeedTabs } from "@/components/FeedTabs";

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
