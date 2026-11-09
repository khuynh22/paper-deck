import { expect, test, vi } from "vitest";
import { newHighlightId } from "@/lib/reader/highlightId";

test("creates a v4 UUID using getRandomValues when randomUUID is unavailable", () => {
  vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => {
    bytes.forEach((_, index) => { bytes[index] = index; });
    return bytes;
  } });
  try {
    expect(newHighlightId()).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
  } finally { vi.unstubAllGlobals(); }
});
