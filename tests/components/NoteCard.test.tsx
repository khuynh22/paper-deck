import { test, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
const mocks = vi.hoisted(() => ({
  updateHighlightNote: vi.fn(),
  deleteHighlight: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/app/actions/highlights", () => mocks);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
import { NoteCard } from "@/components/NoteCard";
const entry = {
  id: "h1",
  paper_id: "p1",
  paper_title: "Research",
  quote: "Saved quote",
  note: "Old note",
  updated_at: "2026-01-01T00:00:00Z",
  block_anchor: "0",
  start_offset: 0,
  end_offset: 11,
};
beforeEach(() => vi.resetAllMocks());
test("failed edits retain drafts and retry the same content", async () => {
  mocks.updateHighlightNote
    .mockResolvedValueOnce({ ok: false, code: "network", message: "Try again" })
    .mockResolvedValueOnce({ ok: true });
  render(<NoteCard entry={entry} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "New thought" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save note" }));
  await screen.findByRole("button", { name: "Retry" });
  expect(screen.getByRole("textbox")).toHaveValue("New thought");
  expect(mocks.refresh).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(mocks.updateHighlightNote).toHaveBeenLastCalledWith(
    "h1",
    "New thought",
  );
});
test("failed deletes keep the quote visible until acknowledgement", async () => {
  mocks.deleteHighlight
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ ok: true });
  render(<NoteCard entry={entry} />);
  fireEvent.click(screen.getByRole("button", { name: "Delete highlight" }));
  await screen.findByRole("button", { name: "Retry" });
  expect(screen.getByText("Saved quote")).toBeVisible();
  expect(mocks.refresh).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
});
test("an older acknowledgement does not discard newer typing", async () => {
  let resolve!: (value: { ok: true }) => void;
  mocks.updateHighlightNote.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  render(<NoteCard entry={entry} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Submitted" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save note" }));
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Newer draft" },
  });
  await act(async () => resolve({ ok: true }));
  expect(screen.getByRole("textbox")).toHaveValue("Newer draft");
});
