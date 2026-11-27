import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

const { serverSave, refresh } = vi.hoisted(() => ({
  serverSave: vi.fn(async () => ({ ok: true, data: undefined })), refresh: vi.fn(),
}));
vi.mock("@/app/actions/progress", () => ({ saveProgress: serverSave }));
vi.mock("@/app/actions/highlights", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { HtmlReader } from "@/components/HtmlReader";

afterEach(() => vi.unstubAllGlobals());

test("reader writes use a stable URL without a build-specific Server Action", async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  window.scrollTo = vi.fn();
  render(<HtmlReader paperId="10000000-0000-4000-8000-000000000001"
    html={'<p data-blk="0">Reader transport</p>'}
    initialProgress={{ scrollPct: 0, readPct: 0.2, markedPct: 0.2,
      blockAnchor: "0", markedAnchor: "0", readerKind: "html", status: "reading" }} />);

  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^clear mark$/i })));

  expect(fetch).toHaveBeenCalledOnce();
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/reader/mutations");
  expect(init.method).toBe("POST");
  expect(new Headers(init.headers).has("next-action")).toBe(false);
  expect(JSON.parse(init.body as string)).toMatchObject({
    operation: "progress", paperId: "10000000-0000-4000-8000-000000000001",
    update: { markedPct: 0 },
  });
  expect(serverSave).not.toHaveBeenCalled();
  expect(refresh).toHaveBeenCalledOnce();
});
