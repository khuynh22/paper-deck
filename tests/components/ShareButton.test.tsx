import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ShareButton } from "@/components/ShareButton";

const ORIGIN = "https://ppdeck.com";

beforeEach(() => {
  vi.stubGlobal("location", { origin: ORIGIN } as Location);
});

afterEach(() => {
  vi.unstubAllGlobals();
  // reset navigator.share between tests
  delete (navigator as { share?: unknown }).share;
});

test("with no native share, click copies the canonical URL and shows 'Copied'", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });

  render(<ShareButton path="/paper/p1" title="Some Paper" />);
  fireEvent.click(screen.getByRole("button"));

  expect(writeText).toHaveBeenCalledWith(`${ORIGIN}/paper/p1`);
  await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("Copied"));
});

test("uses the native share sheet when available and does not copy", async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { share, clipboard: { writeText } });

  render(<ShareButton path="/paper/p1" title="Some Paper" />);
  fireEvent.click(screen.getByRole("button"));

  await waitFor(() =>
    expect(share).toHaveBeenCalledWith({ title: "Some Paper", url: `${ORIGIN}/paper/p1` }),
  );
  expect(writeText).not.toHaveBeenCalled();
});

test("a dismissed share sheet (AbortError) does not fall back to copy", async () => {
  const share = vi.fn().mockRejectedValue(Object.assign(new Error("dismissed"), { name: "AbortError" }));
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { share, clipboard: { writeText } });

  render(<ShareButton path="/paper/p1" title="Some Paper" />);
  fireEvent.click(screen.getByRole("button"));

  await waitFor(() => expect(share).toHaveBeenCalled());
  expect(writeText).not.toHaveBeenCalled();
  expect(screen.getByRole("button")).toHaveTextContent("Share");
});
