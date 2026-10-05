import { test, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const { saveProgress } = vi.hoisted(() => ({
  saveProgress: vi.fn<(...args: [string, Record<string, unknown>]) => Promise<unknown>>(),
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
  saveProgress.mockReset();
  saveProgress.mockResolvedValue({ ok: true, data: undefined });
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

/** jsdom has no layout: stub the content element's rect + height so onMark can
 *  compute a boundary fraction. */
function stubContentGeometry(
  container: HTMLElement,
  innerHeight: number,
  rectTop: number,
  offsetHeight: number,
) {
  Object.defineProperty(window, "innerHeight", { value: innerHeight, configurable: true });
  const content = container.querySelector<HTMLElement>(".paper-html")!;
  content.getBoundingClientRect = () =>
    ({
      top: rectTop,
      left: 0,
      right: 0,
      bottom: rectTop + offsetHeight,
      width: 0,
      height: offsetHeight,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  Object.defineProperty(content, "offsetHeight", { value: offsetHeight, configurable: true });
}

const band = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-testid="read-mark"]');

const PROGRESS = (over: Partial<ProgressRow>): ProgressRow => ({
  scrollPct: 0,
  blockAnchor: null,
  markedAnchor: null,
  readerKind: "html",
  status: "reading",
  readPct: 0,
  markedPct: 0,
  ...over,
});

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
        { id: "h1", paperId: "p1", blockAnchor: "1", startOffset: 0, endOffset: 4, quote: "Beta", note: null },
      ]}
    />,
  );
  expect(container.querySelector('mark.pd-highlight[data-hl-id="h1"]')?.textContent).toBe("Beta");
});

test("no auto rail or wash elements remain", () => {
  const { container } = renderReader(null);
  expect(container.querySelector('[data-testid="read-rail"]')).toBeNull();
  expect(container.querySelector('[data-testid="read-tint"]')).toBeNull();
});

test("an unmarked paper shows no read-mark band", () => {
  const { container } = renderReader(null);
  expect(band(container)).toBeNull();
});

test("renders the read-mark band at the saved marked fraction", () => {
  const { container } = renderReader(PROGRESS({ readPct: 0.5, markedPct: 0.5 }));
  expect(parseFloat(band(container)!.style.height)).toBeCloseTo(50);
});

test("'I finished here' marks down to the viewport bottom and persists", () => {
  const { container } = renderReader(null);
  // innerHeight 200, content top -300, height 1000 => (200 + 300) / 1000 = 0.5
  stubContentGeometry(container, 200, -300, 1000);
  fireEvent.click(screen.getByRole("button", { name: /i finished here/i }));
  expect(parseFloat(band(container)!.style.height)).toBeCloseTo(50);
  expect(saveProgress.mock.calls.at(-1)?.[1]).toMatchObject({ markedPct: 0.5, status: "reading" });
});

test("marking at the bottom persists status done", () => {
  const { container } = renderReader(null);
  // (200 + 800) / 1000 = 1.0 => done
  stubContentGeometry(container, 200, -800, 1000);
  fireEvent.click(screen.getByRole("button", { name: /i finished here/i }));
  expect(saveProgress.mock.calls.at(-1)?.[1]).toMatchObject({ markedPct: 1, status: "done" });
});

test("'Clear mark' removes the band and persists an unmarked, reading state", () => {
  const { container } = renderReader(PROGRESS({ scrollPct: 0.5, status: "done", readPct: 0.9, markedPct: 0.9 }));
  expect(band(container)).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /clear mark/i }));
  expect(band(container)).toBeNull();
  expect(saveProgress.mock.calls.at(-1)?.[1]).toMatchObject({ markedPct: 0, status: "reading" });
});

test("a debounced scroll save does not change the mark or status", () => {
  vi.useFakeTimers();
  try {
    const { container } = renderReader(PROGRESS({ scrollPct: 0.1, blockAnchor: "0", readPct: 0.2, markedPct: 0.5 }));
    setGeometry(300, 200, 1000);
    fireEvent.scroll(window);
    act(() => vi.advanceTimersByTime(600));
    const call = saveProgress.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(call).not.toHaveProperty("status");
    expect(call).not.toHaveProperty("markedPct");
    expect(call).toHaveProperty("readPct");
    // The band is unaffected by scrolling (sticky).
    expect(parseFloat(band(container)!.style.height)).toBeCloseTo(50);
  } finally {
    vi.useRealTimers();
  }
});

test("failed marking shows retry, never Marked, and retries the retained boundary", async () => {
  saveProgress.mockResolvedValueOnce({ ok: false, code: "storage", message: "Couldn’t save. Please retry." });
  saveProgress.mockResolvedValueOnce({ ok: true, data: undefined });
  const { container } = renderReader(null);
  stubContentGeometry(container, 200, -300, 1000);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /i finished here/i })));
  expect(screen.queryByText(/marked ✓/i)).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(/couldn’t save/i);
  // The viewport changes while offline: retry must preserve the button's intent.
  stubContentGeometry(container, 200, -800, 1000);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^retry$/i })));
  expect(saveProgress.mock.calls.at(-1)?.[1]).toMatchObject({ markedPct: 0.5 });
  expect(screen.getByRole("status")).toHaveTextContent(/saved/i);
});

test("a slow mark then clear is serialized and the older response never reports Saved", async () => {
  let finish!: (value: unknown) => void;
  saveProgress.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  let finishClear!: (value: unknown) => void;
  saveProgress.mockImplementationOnce(() => new Promise((resolve) => { finishClear = resolve; }));
  const { container } = renderReader(null);
  stubContentGeometry(container, 200, -300, 1000);
  fireEvent.click(screen.getByRole("button", { name: /i finished here/i }));
  fireEvent.click(screen.getByRole("button", { name: /clear mark/i }));
  expect(saveProgress).toHaveBeenCalledTimes(1);
  await act(async () => finish({ ok: true, data: undefined }));
  expect(saveProgress).toHaveBeenCalledTimes(2);
  expect(saveProgress.mock.calls[1][1]).toMatchObject({ markedPct: 0, status: "reading" });
  expect(screen.getByRole("status")).toHaveTextContent(/saving/i);
  await act(async () => finishClear({ ok: true, data: undefined }));
  expect(screen.getByRole("status")).toHaveTextContent(/saved/i);
  expect(band(container)).toBeNull();
});

test("unmount flushes the latest scroll snapshot instead of cancelling the debounce", async () => {
  const { unmount } = renderReader(null);
  setGeometry(300, 200, 1000);
  fireEvent.scroll(window);
  await act(async () => unmount());
  expect(saveProgress.mock.calls.at(-1)?.[1]).toMatchObject({ scrollPct: 0.375 });
});
