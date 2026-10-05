import { z } from "zod";
import type { Highlight, PdfAnchor } from "@/lib/types";
export const pdfAnchorSchema = z.object({
  page: z.number().int().min(1).max(100000),
  fingerprint: z.string().min(1).max(128),
  rects: z
    .array(
      z
        .object({
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
          width: z.number().positive().max(1),
          height: z.number().positive().max(1),
        })
        .refine(
          (rect) =>
            rect.x + rect.width <= 1.000001 && rect.y + rect.height <= 1.000001,
        ),
    )
    .min(1)
    .max(100),
});
export function samePdfAnchor(
  a: PdfAnchor | undefined,
  b: PdfAnchor | undefined,
) {
  if (!a || !b) return a === b;
  return (
    a.page === b.page &&
    a.fingerprint === b.fingerprint &&
    a.rects.length === b.rects.length &&
    a.rects.every((rect, i) => {
      const other = b.rects[i];
      return (
        rect.x === other.x &&
        rect.y === other.y &&
        rect.width === other.width &&
        rect.height === other.height
      );
    })
  );
}
export function validPdfQuote(
  highlight: Highlight,
  page: number,
  fingerprint: string,
  text: string | null,
) {
  return Boolean(
    text !== null &&
    highlight.quote.length > 0 &&
    highlight.startOffset >= 0 &&
    highlight.endOffset > highlight.startOffset &&
    highlight.endOffset <= text.length &&
    highlight.pdfAnchor?.page === page &&
    highlight.pdfAnchor.fingerprint === fingerprint &&
    text.slice(highlight.startOffset, highlight.endOffset) === highlight.quote,
  );
}
export function normalizedRects(
  rects: Iterable<{ left: number; top: number; right: number; bottom: number }>,
  page: { left: number; top: number; width: number; height: number },
) {
  if (page.width <= 0 || page.height <= 0) return [];
  const result: PdfAnchor["rects"] = [];
  for (const rect of rects) {
    const x = Math.max(0, Math.min(1, (rect.left - page.left) / page.width)),
      y = Math.max(0, Math.min(1, (rect.top - page.top) / page.height)),
      right = Math.max(0, Math.min(1, (rect.right - page.left) / page.width)),
      bottom = Math.max(0, Math.min(1, (rect.bottom - page.top) / page.height));
    if (right > x && bottom > y) {
      const next = { x, y, width: right - x, height: bottom - y };
      if (
        !result.some(
          (r) =>
            Math.abs(r.x - x) < 0.00001 &&
            Math.abs(r.y - y) < 0.00001 &&
            Math.abs(r.width - next.width) < 0.00001 &&
            Math.abs(r.height - next.height) < 0.00001,
        )
      )
        result.push(next);
    }
  }
  return result;
}
