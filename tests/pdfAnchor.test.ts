import { test, expect } from "vitest";
import {
  pdfAnchorSchema,
  samePdfAnchor,
  normalizedRects,
  validPdfQuote,
} from "@/lib/reader/pdfAnchor";
import {
  highlightInputSchema,
  rowToHighlight,
  highlightInsert,
} from "@/lib/db/highlightRow";
const anchor = {
  page: 4,
  fingerprint: "document-identity",
  rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
};
const input = {
  paperId: "paper",
  blockAnchor: "pdf:4",
  startOffset: 0,
  endOffset: 5,
  quote: "Hello",
  note: "Private",
  pdfAnchor: anchor,
};
test("PDF geometry round trips while HTML mappings remain compatible", () => {
  const row = { id: "highlight", ...highlightInsert("owner", input) };
  expect(rowToHighlight(row)).toMatchObject({
    pdfAnchor: anchor,
    quote: "Hello",
  });
  expect(highlightInputSchema.safeParse(input).success).toBe(true);
  expect(
    highlightInputSchema.safeParse({ ...input, blockAnchor: "4" }).success,
  ).toBe(false);
  expect(
    highlightInputSchema.safeParse({ ...input, endOffset: 9 }).success,
  ).toBe(false);
});
test.each([
  { ...anchor, page: 0 },
  { ...anchor, fingerprint: "" },
  { ...anchor, rects: [] },
  { ...anchor, rects: [{ x: 0.9, y: 0, width: 0.2, height: 0.1 }] },
  { ...anchor, rects: [{ x: 0, y: 0, width: NaN, height: 0.1 }] },
])("rejects invalid PDF geometry %j", (value) =>
  expect(pdfAnchorSchema.safeParse(value).success).toBe(false),
);
test("normalized geometry is viewport independent and duplicate boxes are removed", () => {
  const rects = [
    { left: 20, top: 40, right: 60, bottom: 50 },
    { left: 20, top: 40, right: 60, bottom: 50 },
  ];
  expect(
    normalizedRects(rects, { left: 0, top: 0, width: 200, height: 200 }),
  ).toEqual([
    { x: 0.1, y: 0.2, width: 0.19999999999999998, height: 0.04999999999999999 },
  ]);
  expect(
    normalizedRects(rects, { left: 0, top: 0, width: 0, height: 200 }),
  ).toEqual([]);
});
test("identity and exact text must agree before painting a saved PDF quote", () => {
  const h = rowToHighlight({ id: "h", ...highlightInsert("owner", input) });
  expect(validPdfQuote(h, 4, "document-identity", "Hello world")).toBe(true);
  expect(validPdfQuote(h, 4, "changed", "Hello world")).toBe(false);
  expect(validPdfQuote(h, 4, "document-identity", "Other text")).toBe(false);
  expect(
    samePdfAnchor(anchor, {
      rects: anchor.rects,
      fingerprint: anchor.fingerprint,
      page: 4,
    }),
  ).toBe(true);
  expect(samePdfAnchor(anchor, { ...anchor, page: 5 })).toBe(false);
});
