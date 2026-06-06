import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock the server action chain (next/headers) so the client component mounts in jsdom.
const { saveProgress } = vi.hoisted(() => ({
  saveProgress: vi.fn(async (_paperId: string, _update: Record<string, unknown>) => {}),
}));
vi.mock("@/app/actions/progress", () => ({ saveProgress }));

import { HtmlReader } from "@/components/HtmlReader";
import type { ProgressRow } from "@/lib/types";

const HTML = `<p data-blk="0">Alpha</p><p data-blk="1">Beta</p><p data-blk="2">Gamma</p>`;

beforeEach(() => {
  saveProgress.mockClear();
  // jsdom has no layout/scroll; stub so the component's resume effect doesn't warn.
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

function renderReader(progress: ProgressRow | null) {
  return render(<HtmlReader paperId="p1" html={HTML} initialProgress={progress} />);
}

test("renders the paper HTML content", () => {
  renderReader(null);
  expect(screen.getByText("Alpha")).toBeInTheDocument();
  expect(screen.getByText("Gamma")).toBeInTheDocument();
});

test("highlights blocks up to the saved marker on mount", () => {
  const { container } = renderReader({
    scrollPct: 0.3,
    blockAnchor: "1",
    markedAnchor: "1",
    readerKind: "html",
    status: "reading",
  });
  // blocksUpTo("1") => ["0"] is read; "1" and "2" are not.
  expect(container.querySelector('[data-blk="0"]')?.classList.contains("read")).toBe(true);
  expect(container.querySelector('[data-blk="1"]')?.classList.contains("read")).toBe(false);
  expect(container.querySelector('[data-blk="2"]')?.classList.contains("read")).toBe(false);
});

test("shows the reader controls", () => {
  renderReader(null);
  expect(screen.getByRole("button", { name: /i finished here/i })).toBeInTheDocument();
});

test("clicking 'I finished here' persists a marker and applies highlight", () => {
  const { container } = renderReader(null);
  fireEvent.click(screen.getByRole("button", { name: /i finished here/i }));

  // saveProgress called with a markedAnchor (the marker was set).
  expect(saveProgress).toHaveBeenCalled();
  const [, update] = saveProgress.mock.calls[0];
  expect(update).toHaveProperty("markedAnchor");
  expect(update.readerKind).toBe("html");

  // After marking, at least the first block is highlighted as read.
  expect(container.querySelector('[data-blk="0"]')?.classList.contains("read")).toBe(true);

  // The "Clear mark" control now appears.
  expect(screen.getByRole("button", { name: /clear mark/i })).toBeInTheDocument();
});
