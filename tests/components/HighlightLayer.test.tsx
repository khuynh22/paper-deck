import { test, expect, vi, beforeEach } from "vitest";
import { useRef } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";

const actions = vi.hoisted(() => ({
  createHighlight: vi.fn(),
  updateHighlightNote: vi.fn(async () => {}),
  deleteHighlight: vi.fn(async () => {}),
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
  vi.clearAllMocks();
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
  actions.createHighlight.mockResolvedValue({
    id: "h2",
    paperId: "p1",
    blockAnchor: "0",
    startOffset: 10,
    endOffset: 16,
    quote: "models",
    note: null,
  });
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
  });
  expect(container.querySelector('mark.pd-highlight[data-hl-id="h2"]')).not.toBeNull();
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
