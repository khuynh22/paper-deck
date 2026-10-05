import { test, expect } from "vitest";
import { parseNotes, notesHref } from "@/lib/notes/params";
test("notes links preserve private view filters and round trip safely", () => {
  const p = parseNotes({
    q: "  alpha & beta  ",
    paper: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
    page: "2",
  });
  expect(
    parseNotes(
      Object.fromEntries(new URL(notesHref(p), "http://local").searchParams),
    ),
  ).toEqual(p);
  expect(p.paper).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
});
test.each([
  { page: "0" },
  { page: "1.5" },
  { page: "2502" },
  { q: ["x", "y"] },
  { q: "x".repeat(301) },
  { paper: "invalid" },
])("rejects malformed filters %j", (input) => {
  expect(parseNotes(input)).toMatchObject({ invalid: true, page: 1 });
});
