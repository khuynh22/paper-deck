import { test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

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

test("does not render manual mark controls — progress is automatic", () => {
  renderReader(null);
  expect(screen.queryByRole("button", { name: /i finished here/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /clear mark/i })).toBeNull();
});

test("seeds the read rail from the saved read depth", () => {
  const { container } = renderReader({
    scrollPct: 0.3,
    blockAnchor: "1",
    markedAnchor: null,
    readerKind: "html",
    status: "reading",
    readPct: 0.5,
  });
  const rail = container.querySelector<HTMLElement>('[data-testid="read-rail"]');
  expect(rail).not.toBeNull();
  expect(rail!.style.height).toBe("50%");
});

test("an unread paper shows an empty rail", () => {
  const { container } = renderReader(null);
  const rail = container.querySelector<HTMLElement>('[data-testid="read-rail"]');
  expect(rail).not.toBeNull();
  expect(rail!.style.height).toBe("0%");
});
