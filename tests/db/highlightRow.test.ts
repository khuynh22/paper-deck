import { test, expect } from "vitest";
import {
  rowToHighlight,
  highlightInsert,
  highlightInputSchema,
  type HighlightRow,
} from "@/lib/db/highlightRow";

const ROW: HighlightRow = {
  id: "h1",
  paper_id: "p1",
  block_anchor: "12",
  start_offset: 3,
  end_offset: 9,
  quote: "sample",
  note: "a note",
};

test("rowToHighlight maps snake_case columns to the camelCase app shape", () => {
  expect(rowToHighlight(ROW)).toEqual({
    id: "h1",
    paperId: "p1",
    blockAnchor: "12",
    startOffset: 3,
    endOffset: 9,
    quote: "sample",
    note: "a note",
  });
});

test("highlightInsert builds the row payload with the user id and null note default", () => {
  expect(
    highlightInsert("user-1", {
      paperId: "p1",
      blockAnchor: "12",
      startOffset: 3,
      endOffset: 9,
      quote: "sample",
    }),
  ).toEqual({
    user_id: "user-1",
    paper_id: "p1",
    block_anchor: "12",
    start_offset: 3,
    end_offset: 9,
    quote: "sample",
    note: null,
  });
});

test("schema rejects an empty selection (end <= start)", () => {
  const r = highlightInputSchema.safeParse({
    paperId: "p1",
    blockAnchor: "12",
    startOffset: 5,
    endOffset: 5,
    quote: "x",
  });
  expect(r.success).toBe(false);
});

test("schema rejects a quote that is too long", () => {
  const r = highlightInputSchema.safeParse({
    paperId: "p1",
    blockAnchor: "12",
    startOffset: 0,
    endOffset: 1,
    quote: "x".repeat(1001),
  });
  expect(r.success).toBe(false);
});

test("schema accepts a valid input with an optional note", () => {
  const r = highlightInputSchema.safeParse({
    paperId: "p1",
    blockAnchor: "12",
    startOffset: 0,
    endOffset: 4,
    quote: "test",
    note: "hi",
  });
  expect(r.success).toBe(true);
});
