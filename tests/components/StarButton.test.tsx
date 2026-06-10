import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock the server action and the router so the client component mounts in jsdom.
const mocks = vi.hoisted(() => ({
  toggleStar: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/app/actions/star", () => ({ toggleStar: mocks.toggleStar }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

import { StarButton } from "@/components/StarButton";

beforeEach(() => {
  vi.clearAllMocks();
});

function getButton() {
  return screen.getByRole("button");
}

test("keeps the optimistic state when the save succeeds", async () => {
  mocks.toggleStar.mockResolvedValue({ ok: true, starred: false });
  render(<StarButton paperId="p1" initialStarred={true} />);

  fireEvent.click(getButton());

  await waitFor(() => expect(getButton()).toHaveAttribute("aria-pressed", "false"));
  expect(mocks.toggleStar).toHaveBeenCalledWith("p1", true);
});

test("reverts the optimistic star when the save fails", async () => {
  mocks.toggleStar.mockResolvedValue({ ok: false, error: "save-failed" });
  render(<StarButton paperId="p1" initialStarred={false} />);

  fireEvent.click(getButton());
  // optimistic flip happens immediately...
  expect(getButton()).toHaveAttribute("aria-pressed", "true");

  // ...then reverts once the action reports the write was rejected.
  await waitFor(() => expect(getButton()).toHaveAttribute("aria-pressed", "false"));
  expect(mocks.push).not.toHaveBeenCalled();
});

test("reverts and redirects to login when auth is required", async () => {
  mocks.toggleStar.mockResolvedValue({ ok: false, error: "auth-required" });
  render(<StarButton paperId="p1" initialStarred={false} />);

  fireEvent.click(getButton());

  await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/login"));
  expect(getButton()).toHaveAttribute("aria-pressed", "false");
});

test("reverts when the action throws (network failure)", async () => {
  mocks.toggleStar.mockRejectedValue(new Error("fetch failed"));
  render(<StarButton paperId="p1" initialStarred={false} />);

  fireEvent.click(getButton());

  await waitFor(() => expect(getButton()).toHaveAttribute("aria-pressed", "false"));
});
