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

function setGeometry(scrollY: number, innerHeight: number, scrollHeight: number) {
  Object.defineProperty(window, "scrollY", { value: scrollY, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: innerHeight, configurable: true });
  Object.defineProperty(document.documentElement, "scrollHeight", {
    value: scrollHeight,
    configurable: true,
  });
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

test("the read rail follows current scroll depth and shrinks on scroll up", () => {
  const { container } = renderReader(null);
  const rail = () => container.querySelector<HTMLElement>('[data-testid="read-rail"]')!;

  // Doc 1000px, viewport 200px. scrollY=300 => (300+200)/1000 = 0.5.
  setGeometry(300, 200, 1000);
  fireEvent.scroll(window);
  expect(rail().style.height).toBe("50%");

  // Scroll back up: scrollY=50 => (50+200)/1000 = 0.25. A monotonic rail would
  // stay at 50%; the reversible rail drops to 25%.
  setGeometry(50, 200, 1000);
  fireEvent.scroll(window);
  expect(rail().style.height).toBe("25%");
});
