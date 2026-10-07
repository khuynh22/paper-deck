import { beforeEach, expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const { saveProgress, pdf } = vi.hoisted(() => ({
  saveProgress: vi.fn(),
  pdf: { onLoadSuccess: null as null | ((value: { numPages: number }) => void) },
}));
vi.mock("@/app/actions/progress", () => ({ saveProgress }));
vi.mock("react-pdf", () => ({
  pdfjs: { version: "test", GlobalWorkerOptions: {} },
  Document: ({ children, onLoadSuccess }: { children: ReactNode; onLoadSuccess: (value: { numPages: number }) => void }) => {
    pdf.onLoadSuccess = onLoadSuccess;
    return <div>{children}</div>;
  },
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
  expect(screen.getByRole("button", { name: /clear mark/i })).toHaveTextContent(/unsaved/i);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^retry$/i })));
  expect(saveProgress).toHaveBeenLastCalledWith("p1", expect.objectContaining({ markedAnchor: "1", readerKind: "pdf" }));
  expect(screen.getByRole("status", { name: "Reading progress save" })).toHaveTextContent("Saved");
});

test("PDF resumes a saved page using its document position below the reader header", async () => {
  vi.useFakeTimers();
  const previousScrollTo = window.scrollTo;
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  const header = document.createElement("div");
  header.setAttribute("data-reader-header", "");
  header.getBoundingClientRect = () => ({ bottom: 104 }) as DOMRect;
  document.body.append(header);
  Object.defineProperty(window, "scrollY", { value: 700, configurable: true });
  try {
    const { container } = render(<PdfReader paperId="p1" initialProgress={{
      scrollPct: 0.7, blockAnchor: "2", markedAnchor: null, readerKind: "pdf",
      status: "reading", readPct: 0, markedPct: 0,
    }} />);
    act(() => pdf.onLoadSuccess?.({ numPages: 3 }));
    const pageTwo = container.querySelector<HTMLElement>('[data-page="2"]')!;
    Object.defineProperty(pageTwo, "offsetTop", { value: 10 });
    pageTwo.getBoundingClientRect = () => ({ top: 300 }) as DOMRect;
    await act(async () => vi.advanceTimersByTimeAsync(350));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 884 });
  } finally {
    header.remove();
    raf.mockRestore();
    window.scrollTo = previousScrollTo;
    vi.useRealTimers();
  }
});

test("PDF page sampling tolerates subpixel resume rounding", async () => {
  vi.useFakeTimers();
  const header = document.createElement("div");
  header.setAttribute("data-reader-header", "");
  header.getBoundingClientRect = () => ({ bottom: 104 }) as DOMRect;
  document.body.append(header);
  try {
    const { container } = render(<PdfReader paperId="p1" initialProgress={null} />);
    act(() => pdf.onLoadSuccess?.({ numPages: 3 }));
    const pages = [...container.querySelectorAll<HTMLElement>("[data-page]")];
    pages[0].getBoundingClientRect = () => ({ top: -100 }) as DOMRect;
    pages[1].getBoundingClientRect = () => ({ top: 116.8 }) as DOMRect;
    pages[2].getBoundingClientRect = () => ({ top: 300 }) as DOMRect;
    fireEvent.scroll(window);
    await act(async () => vi.advanceTimersByTimeAsync(650));
    expect(saveProgress.mock.calls.at(-1)?.[1]).toMatchObject({ blockAnchor: "2" });
  } finally {
    header.remove();
    vi.useRealTimers();
  }
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
  expect(screen.getByRole("status", { name: "Reading progress save" })).toHaveTextContent("Saved");
});

test("PDF unmount flushes a debounced scroll snapshot", async () => {
  const { unmount } = render(<PdfReader paperId="p1" initialProgress={null} />);
  fireEvent.scroll(window);
  await act(async () => unmount());
  expect(saveProgress).toHaveBeenCalledWith("p1", expect.objectContaining({ readerKind: "pdf" }));
});

test("a destination page scroll does not replace queued PDF progress", async () => {
  const oldPath = window.location.pathname;
  try {
    Object.defineProperty(window, "scrollY", { value: 500, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
    Object.defineProperty(document.documentElement, "scrollHeight", { value: 1800, configurable: true });
    const { unmount } = render(<PdfReader paperId="p1" initialProgress={null} />);
    fireEvent.scroll(window);
    window.history.pushState({}, "", "/paper/p1");
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    Object.defineProperty(document.documentElement, "scrollHeight", { value: 800, configurable: true });
    fireEvent.scroll(window);
    await act(async () => unmount());
    expect(saveProgress.mock.calls.at(-1)?.[1]).toMatchObject({ scrollPct: 0.5 });
  } finally {
    window.history.replaceState({}, "", oldPath);
  }
});

test("PDF scroll computes the current page at most once per 250 ms", () => {
  const now = vi.spyOn(Date, "now");
  try {
    const { container } = render(<PdfReader paperId="p1" initialProgress={null} />);
    const pages = container.querySelector<HTMLElement>("[data-page]")?.parentElement ??
      container.querySelector<HTMLElement>(".mx-auto.flex")!;
    const geometry = vi.spyOn(pages, "querySelectorAll");
    for (let i = 0; i < 20; i++) {
      now.mockReturnValue(i * 16);
      fireEvent.scroll(window);
    }
    expect(geometry).toHaveBeenCalledTimes(2);
    now.mockReturnValue(512);
    fireEvent.scroll(window);
    expect(geometry).toHaveBeenCalledTimes(3);
  } finally { now.mockRestore(); }
});

test("a fast final PDF scroll saves its trailing page", async () => {
  vi.useFakeTimers();
  try {
    const { container } = render(<PdfReader paperId="p1" initialProgress={null} />);
    act(() => pdf.onLoadSuccess?.({ numPages: 3 }));
    const pages = [...container.querySelectorAll<HTMLElement>("[data-page]")];
    let top = 1;
    pages.forEach((page, index) => {
      page.getBoundingClientRect = () => ({ top: index + 1 <= top ? -100 : 100 }) as DOMRect;
    });
    fireEvent.scroll(window);
    await act(async () => vi.advanceTimersByTimeAsync(100));
    top = 3;
    fireEvent.scroll(window);
    await act(async () => vi.advanceTimersByTimeAsync(750));
    expect(saveProgress.mock.calls.at(-1)?.[1]).toMatchObject({ blockAnchor: "3" });
  } finally { vi.useRealTimers(); }
});

test("PDF navigation before trailing measurement saves percentage without a stale page", async () => {
  vi.useFakeTimers();
  try {
    const { unmount } = render(<PdfReader paperId="p1" initialProgress={null} />);
    fireEvent.scroll(window);
    await act(async () => vi.advanceTimersByTimeAsync(100));
    fireEvent.scroll(window);
    await act(async () => unmount());
    expect(saveProgress.mock.calls.at(-1)?.[1]).toMatchObject({ blockAnchor: null, readerKind: "pdf" });
  } finally { vi.useRealTimers(); }
});

test("failed PDF Clear shows the previous pages as an unsaved removal", async () => {
  saveProgress.mockResolvedValueOnce({ ok: false, code: "storage", message: "Couldn’t save. Please retry." });
  const { container } = render(<PdfReader paperId="p1" initialProgress={{
    scrollPct: 0, blockAnchor: "1", markedAnchor: "2", readerKind: "pdf",
    status: "reading", readPct: 0, markedPct: 0,
  }} />);
  act(() => pdf.onLoadSuccess?.({ numPages: 3 }));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^clear mark$/i })));
  expect(container.querySelector('[data-page="1"]')).toHaveTextContent("clear unsaved");
  expect(screen.getByText(/clear mark \(unsaved\)/i)).toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^retry$/i })));
  expect(container.querySelector('[data-page="1"]')).not.toHaveTextContent("clear unsaved");
});
