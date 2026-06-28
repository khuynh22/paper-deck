import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// Mock the server action chain (next/headers) so the client component mounts in jsdom.
const { saveProgress } = vi.hoisted(() => ({
  saveProgress: vi.fn(async (_paperId: string, _update: Record<string, unknown>) => {}),
}));
vi.mock("@/app/actions/progress", () => ({ saveProgress }));

vi.mock("@/app/actions/highlights", () => ({
  loadHighlights: vi.fn(async () => []),
  createHighlight: vi.fn(),
  updateHighlightNote: vi.fn(async () => {}),
  deleteHighlight: vi.fn(async () => {}),
}));

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

test("paints an initial highlight passed to the reader", () => {
  const { container } = render(
    <HtmlReader
      paperId="p1"
      html={HTML}
      initialProgress={null}
      initialHighlights={[
        {
          id: "h1",
          paperId: "p1",
          blockAnchor: "1",
          startOffset: 0,
          endOffset: 4,
          quote: "Beta",
          note: null,
        },
      ]}
    />,
  );
  expect(container.querySelector('mark.pd-highlight[data-hl-id="h1"]')?.textContent).toBe("Beta");
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
    readMaxPct: 0,
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

test("scrolling past the end then back up persists status done, then reading", () => {
  vi.useFakeTimers();
  try {
    renderReader(null);

    // Scroll to the bottom (>= 0.98): (790 + 200) / 1000 = 0.99 -> done
    setGeometry(790, 200, 1000);
    fireEvent.scroll(window);
    act(() => vi.advanceTimersByTime(600)); // flush the 600ms debounced persist
    expect(saveProgress.mock.calls.at(-1)?.[1]).toMatchObject({ status: "done" });

    // Scroll back up (0.5): (300 + 200) / 1000 = 0.5 -> reading (done un-marks)
    setGeometry(300, 200, 1000);
    fireEvent.scroll(window);
    act(() => vi.advanceTimersByTime(600));
    expect(saveProgress.mock.calls.at(-1)?.[1]).toMatchObject({ status: "reading" });
  } finally {
    vi.useRealTimers();
  }
});

test("hides the read tint until the paper is finished", () => {
  const { container } = renderReader({
    scrollPct: 0.5,
    blockAnchor: "1",
    markedAnchor: null,
    readerKind: "html",
    status: "reading",
    readPct: 0.5,
    readMaxPct: 0.5,
  });
  const tint = container.querySelector<HTMLElement>('[data-testid="read-tint"]');
  expect(tint).not.toBeNull();
  expect(tint).toHaveClass("opacity-0");
  expect(tint).not.toHaveClass("opacity-100");
});

test("shows the read tint at the deepest read depth once finished", () => {
  const { container } = renderReader({
    scrollPct: 0.9,
    blockAnchor: "2",
    markedAnchor: null,
    readerKind: "html",
    status: "done",
    readPct: 0.99,
    readMaxPct: 0.99,
  });
  const tint = container.querySelector<HTMLElement>('[data-testid="read-tint"]');
  expect(tint).not.toBeNull();
  // 0.99 * 100 is not exactly 99 in IEEE754, so compare numerically, not by string.
  expect(parseFloat(tint!.style.height)).toBeCloseTo(99);
  expect(tint).toHaveClass("opacity-100");
});

test("the read tint appears at the bottom and stays (sticky) when scrolling back up", () => {
  const { container } = renderReader(null);
  const tint = () => container.querySelector<HTMLElement>('[data-testid="read-tint"]');

  // Not finished yet: (300 + 200) / 1000 = 0.5 -> no tint.
  setGeometry(300, 200, 1000);
  fireEvent.scroll(window);
  expect(tint()).toHaveClass("opacity-0");

  // Scroll to the bottom (>= 0.98): (790 + 200) / 1000 = 0.99 -> tint appears.
  setGeometry(790, 200, 1000);
  fireEvent.scroll(window);
  expect(tint()).toHaveClass("opacity-100");
  expect(parseFloat(tint()!.style.height)).toBeCloseTo(99);

  // Scroll back up (0.25): the rail shrinks, but the tint stays at its max.
  setGeometry(50, 200, 1000);
  fireEvent.scroll(window);
  const rail = container.querySelector<HTMLElement>('[data-testid="read-rail"]');
  expect(rail!.style.height).toBe("25%");
  expect(tint()).toHaveClass("opacity-100");
  expect(parseFloat(tint()!.style.height)).toBeCloseTo(99);
});

test("persists read_max_pct as the running max even after scrolling up", () => {
  vi.useFakeTimers();
  try {
    renderReader(null);

    // Bottom: (790 + 200) / 1000 = 0.99
    setGeometry(790, 200, 1000);
    fireEvent.scroll(window);
    act(() => vi.advanceTimersByTime(600));
    expect(saveProgress.mock.calls.at(-1)?.[1]).toMatchObject({ readMaxPct: 0.99 });

    // Up: current depth (300 + 200) / 1000 = 0.5, but the max stays 0.99.
    setGeometry(300, 200, 1000);
    fireEvent.scroll(window);
    act(() => vi.advanceTimersByTime(600));
    const last = saveProgress.mock.calls.at(-1)?.[1] as Record<string, number>;
    expect(last.readPct).toBe(0.5);
    expect(last.readMaxPct).toBe(0.99);
  } finally {
    vi.useRealTimers();
  }
});
