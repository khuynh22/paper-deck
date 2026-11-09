import { afterEach, expect, test, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { useUnsavedChanges } from "@/components/useUnsavedChanges";

function Harness({ dirty }: { dirty: boolean }) {
  useUnsavedChanges(dirty);
  return <a href="/elsewhere">Leave reader</a>;
}
afterEach(() => vi.restoreAllMocks());

test("reload is warned only while changes are unsaved", () => {
  const { rerender } = render(<Harness dirty />);
  const pending = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(pending);
  expect(pending.defaultPrevented).toBe(true);
  rerender(<Harness dirty={false} />);
  const saved = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(saved);
  expect(saved.defaultPrevented).toBe(false);
});

test("declining navigation keeps the reader and its draft mounted", () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  const { getByRole } = render(<Harness dirty />);
  expect(fireEvent.click(getByRole("link"))).toBe(false);
});

test("sign-in in another tab does not discard the draft or prompt to leave", () => {
  const confirm = vi.spyOn(window, "confirm");
  const { getByRole } = render(<Harness dirty />);
  getByRole("link").setAttribute("target", "_blank");
  expect(fireEvent.click(getByRole("link"))).toBe(true);
  expect(confirm).not.toHaveBeenCalled();
});

test("two dirty reader surfaces ask only once when leaving", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<><Harness dirty /><Harness dirty /></>);
  const link = document.querySelector("a")!;
  link.addEventListener("click", (event) => event.preventDefault());
  fireEvent.click(link);
  expect(confirm).toHaveBeenCalledTimes(1);
});
