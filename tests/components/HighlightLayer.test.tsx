import { test, expect, vi, beforeEach } from "vitest";
import { useRef } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";

const actions = vi.hoisted(() => ({
  createHighlight: vi.fn(),
  updateHighlightNote: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  deleteHighlight: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));
vi.mock("@/app/actions/highlights", () => actions);

import { HighlightLayer } from "@/components/HighlightLayer";
import type { Highlight } from "@/lib/types";

const HTML = `<p data-blk="0">Diffusion models are great</p>`;

function Harness({ initial }: { initial: Highlight[] }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div>
      <div ref={ref} dangerouslySetInnerHTML={{ __html: HTML }} />
      <HighlightLayer paperId="p1" containerRef={ref} initialHighlights={initial} />
    </div>
  );
}

function selectText(container: HTMLElement, from: number, to: number) {
  const p = container.querySelector('[data-blk="0"]')!;
  const textNode = p.firstChild!;
  const range = document.createRange();
  range.setStart(textNode, from);
  range.setEnd(textNode, to);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  fireEvent.mouseUp(document);
}

beforeEach(() => {
  vi.resetAllMocks();
  actions.updateHighlightNote.mockResolvedValue({ ok: true, data: undefined });
  actions.deleteHighlight.mockResolvedValue({ ok: true, data: undefined });
});

test("an initial highlight is painted as a mark on mount", () => {
  const { container } = render(
    <Harness
      initial={[
        {
          id: "h1",
          paperId: "p1",
          blockAnchor: "0",
          startOffset: 10,
          endOffset: 16,
          quote: "models",
          note: "hi",
        },
      ]}
    />,
  );
  const mark = container.querySelector("mark.pd-highlight");
  expect(mark).not.toBeNull();
  expect(mark!.textContent).toBe("models");
});

test("selecting text shows the Highlight button; clicking it creates and paints a highlight", async () => {
  actions.createHighlight.mockResolvedValue({ ok: true, data: {
    id: "h2",
    paperId: "p1",
    blockAnchor: "0",
    startOffset: 10,
    endOffset: 16,
    quote: "models",
    note: null,
  } });
  const { container } = render(<Harness initial={[]} />);

  selectText(container, 10, 16); // "models"
  const btn = await screen.findByRole("button", { name: /highlight/i });

  await act(async () => {
    fireEvent.click(btn);
  });

  expect(actions.createHighlight).toHaveBeenCalledWith({
    paperId: "p1",
    blockAnchor: "0",
    startOffset: 10,
    endOffset: 16,
    quote: "models",
    note: null,
  }, expect.any(String));
  expect(container.querySelector('mark.pd-highlight[data-hl-id="h2"]')).not.toBeNull();
});

test("selection toolbar opens below text close to the sticky reader header", () => {
  const header = document.createElement("div");
  header.setAttribute("data-reader-header", "");
  header.getBoundingClientRect = () => ({ bottom: 116 } as DOMRect);
  document.body.appendChild(header);
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 200, top: 130, bottom: 145, width: 60 }),
  });
  try {
    const { container } = render(<Harness initial={[]} />);
    selectText(container, 10, 16);
    const controls = container.querySelector<HTMLElement>("[data-highlight-controls]")!;
    expect(controls.style.top).toBe("153px");
    expect(controls.className).not.toContain("-translate-y-full");
  } finally {
    Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
    header.remove();
  }
});

test("clicking an existing mark opens the note editor; saving calls updateHighlightNote", async () => {
  const { container } = render(
    <Harness
      initial={[
        {
          id: "h1",
          paperId: "p1",
          blockAnchor: "0",
          startOffset: 10,
          endOffset: 16,
          quote: "models",
          note: null,
        },
      ]}
    />,
  );
  const mark = container.querySelector("mark.pd-highlight")!;

  await act(async () => {
    fireEvent.click(mark);
  });
  const textarea = await screen.findByRole("textbox");
  fireEvent.change(textarea, { target: { value: "key idea" } });

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
  });
  expect(actions.updateHighlightNote).toHaveBeenCalledWith("h1", "key idea");
});

test("deleting from the editor calls deleteHighlight and removes the mark", async () => {
  const { container } = render(
    <Harness
      initial={[
        {
          id: "h1",
          paperId: "p1",
          blockAnchor: "0",
          startOffset: 10,
          endOffset: 16,
          quote: "models",
          note: null,
        },
      ]}
    />,
  );
  await act(async () => {
    fireEvent.click(container.querySelector("mark.pd-highlight")!);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
  });
  expect(actions.deleteHighlight).toHaveBeenCalledWith("h1");
  expect(container.querySelector("mark.pd-highlight")).toBeNull();
});

const INITIAL: Highlight = { id: "h1", paperId: "p1", blockAnchor: "0", startOffset: 10, endOffset: 16, quote: "models", note: null };
const FAILURE = { ok: false, code: "storage", message: "Couldn’t save. Please retry." };

test("a failed note save keeps the editor and draft for retry", async () => {
  actions.updateHighlightNote.mockResolvedValueOnce(FAILURE);
  actions.updateHighlightNote.mockResolvedValueOnce({ ok: true, data: undefined });
  const { container } = render(<Harness initial={[INITIAL]} />);
  fireEvent.click(container.querySelector("mark")!);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "keep my work" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^save$/i })));
  expect(screen.getByRole("textbox")).toHaveValue("keep my work");
  expect(screen.getByRole("alert")).toHaveTextContent(/couldn’t save/i);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^retry$/i })));
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.getByRole("status", { name: "Highlight save" })).toHaveTextContent(/saved/i);
});

test("failed deletion retains the mark and editor until a successful retry", async () => {
  actions.deleteHighlight.mockResolvedValueOnce(FAILURE);
  actions.deleteHighlight.mockResolvedValueOnce({ ok: true, data: undefined });
  const { container } = render(<Harness initial={[INITIAL]} />);
  fireEvent.click(container.querySelector("mark")!);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^delete$/i })));
  expect(container.querySelector("mark")).not.toBeNull();
  expect(screen.getByRole("textbox")).toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^retry$/i })));
  expect(container.querySelector("mark")).toBeNull();
});

test("an older save acknowledgement does not close a newly edited note", async () => {
  let finish!: (value: unknown) => void;
  actions.updateHighlightNote.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { container } = render(<Harness initial={[INITIAL]} />);
  fireEvent.click(container.querySelector("mark")!);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "first" } });
  fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "newer" } });
  await act(async () => finish({ ok: true, data: undefined }));
  expect(screen.getByRole("textbox")).toHaveValue("newer");
  expect(screen.queryByText(/^saved$/i)).not.toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^save$/i })));
  expect(actions.updateHighlightNote).toHaveBeenLastCalledWith("h1", "newer");
});

test("creation retry uses the same ID after a transport failure and paints only one mark", async () => {
  actions.createHighlight.mockRejectedValueOnce(new Error("lost response"));
  actions.createHighlight.mockResolvedValueOnce({ ok: true, data: INITIAL });
  const { container } = render(<Harness initial={[]} />);
  selectText(container, 10, 16);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^highlight$/i })));
  expect(screen.getByRole("alert")).toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^retry$/i })));
  const first = actions.createHighlight.mock.calls[0];
  expect(first[1]).toMatch(/^[0-9a-f-]{36}$/);
  expect(actions.createHighlight.mock.calls[1]).toEqual(first);
  expect(container.querySelectorAll("mark")).toHaveLength(1);
});

test("clicking the selection toolbar does not lose the pending highlight on mouseup", async () => {
  actions.createHighlight.mockResolvedValueOnce({ ok: true, data: INITIAL });
  const { container } = render(<Harness initial={[]} />);
  selectText(container, 10, 16);
  const button = screen.getByRole("button", { name: /^highlight$/i });
  window.getSelection()?.removeAllRanges();
  fireEvent.mouseUp(button);
  await act(async () => fireEvent.click(button));
  expect(container.querySelector("mark")).not.toBeNull();
});

test("a slow note save immediately shows Saving and disables duplicate mutations", async () => {
  let finish!: (value: unknown) => void;
  actions.updateHighlightNote.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { container } = render(<Harness initial={[INITIAL]} />);
  fireEvent.click(container.querySelector("mark")!);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "draft" } });
  fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
  expect(screen.getByRole("status", { name: "Highlight save" })).toHaveTextContent("Saving");
  expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  expect(screen.getByRole("button", { name: /^delete$/i })).toBeDisabled();
  await act(async () => finish({ ok: true, data: undefined }));
});

test("a new selection does not inherit the previous highlight's Saved message", async () => {
  actions.createHighlight.mockResolvedValueOnce({ ok: true, data: INITIAL });
  const { container } = render(<Harness initial={[]} />);
  selectText(container, 10, 16);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^highlight$/i })));
  expect(screen.getByRole("status", { name: "Highlight save" })).toHaveTextContent("Saved");
  selectText(container, 0, 9);
  expect(screen.getByRole("status", { name: "Highlight save" })).toBeEmptyDOMElement();
});

test("cancelling an uncertain creation deletes its ID before allowing a new range", async () => {
  actions.createHighlight.mockResolvedValueOnce(FAILURE);
  actions.createHighlight.mockResolvedValueOnce({ ok: true, data: { ...INITIAL,
    startOffset: 8, endOffset: 18, quote: "n models a" } });
  const { container } = render(<Harness initial={[]} />);
  selectText(container, 10, 16);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^highlight$/i })));
  const firstId = actions.createHighlight.mock.calls[0][1];
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^cancel$/i })));
  expect(actions.deleteHighlight).toHaveBeenCalledWith(firstId);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  selectText(container, 8, 18);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^highlight$/i })));
  expect(actions.createHighlight.mock.calls[1][0]).toMatchObject({ startOffset: 8, endOffset: 18 });
  expect(actions.createHighlight.mock.calls[1][1]).not.toBe(firstId);
  expect(container.querySelectorAll("mark")).toHaveLength(1);
});

test("Cancel after an authentication failure closes without trying to delete", async () => {
  actions.createHighlight.mockResolvedValueOnce({
    ok: false,
    code: "auth",
    message: "Sign in to save your highlight.",
  });
  const { container } = render(<Harness initial={[]} />);
  selectText(container, 10, 16);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^highlight$/i })));
  expect(screen.getByRole("alert")).toHaveTextContent(/sign in/i);

  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^cancel$/i })));
  expect(actions.deleteHighlight).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^cancel$/i })).not.toBeInTheDocument();
  expect(screen.getByRole("status", { name: "Highlight save" })).toBeEmptyDOMElement();

  selectText(container, 8, 18);
  expect(screen.getByRole("button", { name: /^highlight$/i })).toBeEnabled();
});

test("a successful highlight toast disappears after a short delay", async () => {
  vi.useFakeTimers();
  try {
    actions.createHighlight.mockResolvedValueOnce({ ok: true, data: INITIAL });
    const { container } = render(<Harness initial={[]} />);
    selectText(container, 10, 16);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /^highlight$/i })));
    expect(screen.getByRole("status", { name: "Highlight save" })).toHaveTextContent("Saved");
    act(() => vi.advanceTimersByTime(2500));
    expect(screen.getByRole("status", { name: "Highlight save" })).toBeEmptyDOMElement();
  } finally { vi.useRealTimers(); }
});

test("a non-retryable note failure keeps the draft but offers Cancel instead of Retry", async () => {
  actions.updateHighlightNote.mockResolvedValueOnce({ ok: false, code: "not_found", message: "Highlight no longer exists." });
  const { container } = render(<Harness initial={[INITIAL]} />);
  fireEvent.click(container.querySelector("mark")!);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "copy me" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^save$/i })));
  expect(screen.getByRole("textbox")).toHaveValue("copy me");
  expect(screen.queryByRole("button", { name: /^retry$/i })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
  expect(container.querySelector("mark.pd-highlight")).toBeNull();
});

test("failed discard stays visible and Retry deletes rather than recreates the highlight", async () => {
  actions.createHighlight.mockResolvedValueOnce(FAILURE);
  actions.deleteHighlight.mockResolvedValueOnce(FAILURE);
  actions.deleteHighlight.mockResolvedValueOnce({ ok: true, data: undefined });
  const { container } = render(<Harness initial={[]} />);
  selectText(container, 10, 16);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^highlight$/i })));
  const firstId = actions.createHighlight.mock.calls[0][1];
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^cancel$/i })));
  expect(screen.getByRole("alert")).toHaveTextContent(/discard/i);
  window.getSelection()?.removeAllRanges();
  fireEvent.mouseUp(document.body);
  expect(screen.getByRole("alert")).toHaveTextContent(/discard/i);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^retry$/i })));
  expect(actions.deleteHighlight).toHaveBeenCalledTimes(2);
  expect(actions.deleteHighlight).toHaveBeenLastCalledWith(firstId);
  expect(actions.createHighlight).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("highlight status region stays mounted through create and success", async () => {
  let finish!: (value: unknown) => void;
  actions.createHighlight.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { container } = render(<Harness initial={[]} />);
  const status = screen.getByRole("status", { name: "Highlight save" });
  expect(status).toBeEmptyDOMElement();
  selectText(container, 10, 16);
  fireEvent.click(screen.getByRole("button", { name: /^highlight$/i }));
  expect(screen.getByRole("status", { name: "Highlight save" })).toBe(status);
  expect(status).toHaveTextContent("Saving");
  await act(async () => finish({ ok: true, data: INITIAL }));
  expect(screen.getByRole("status", { name: "Highlight save" })).toBe(status);
  expect(status).toHaveTextContent("Saved");
});
