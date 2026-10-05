import { beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const { saveProgress } = vi.hoisted(() => ({ saveProgress: vi.fn() }));
vi.mock("@/app/actions/progress", () => ({ saveProgress }));
vi.mock("react-pdf", () => ({
  pdfjs: { version: "test", GlobalWorkerOptions: {} },
  Document: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Page: () => <div>PDF page</div>,
}));
import { PdfReader } from "@/components/PdfReader";

beforeEach(() => {
  saveProgress.mockReset().mockResolvedValue({ ok: true, data: undefined });
});

test("PDF marker failure is visible and retry persists the original page", async () => {
  saveProgress.mockResolvedValueOnce({ ok: false, code: "auth", message: "Sign in again, then retry." });
  render(<PdfReader paperId="p1" initialProgress={null} />);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /i finished here/i })));
  expect(screen.getByRole("alert")).toHaveTextContent(/sign in again/i);
  expect(screen.getByRole("link", { name: /sign in in a new tab/i })).toHaveAttribute("target", "_blank");
  expect(screen.queryByText(/marked ✓/i)).not.toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^retry$/i })));
  expect(saveProgress).toHaveBeenLastCalledWith("p1", expect.objectContaining({ markedAnchor: "1", readerKind: "pdf" }));
  expect(screen.getByRole("status")).toHaveTextContent("Saved");
});

test("PDF clear waits for a slow mark and its acknowledgement is the final state", async () => {
  let finish!: (value: unknown) => void;
  saveProgress.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(<PdfReader paperId="p1" initialProgress={null} />);
  fireEvent.click(screen.getByRole("button", { name: /i finished here/i }));
  fireEvent.click(screen.getByRole("button", { name: /clear mark/i }));
  expect(saveProgress).toHaveBeenCalledTimes(1);
  await act(async () => finish({ ok: true, data: undefined }));
  expect(saveProgress).toHaveBeenLastCalledWith("p1", expect.objectContaining({ markedAnchor: null, status: "reading" }));
  expect(screen.queryByRole("button", { name: /clear mark/i })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Saved");
});

test("PDF unmount flushes a debounced scroll snapshot", async () => {
  const { unmount } = render(<PdfReader paperId="p1" initialProgress={null} />);
  fireEvent.scroll(window);
  await act(async () => unmount());
  expect(saveProgress).toHaveBeenCalledWith("p1", expect.objectContaining({ readerKind: "pdf" }));
});
