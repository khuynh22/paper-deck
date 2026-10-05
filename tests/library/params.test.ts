import { test, expect } from "vitest";
import { parseLibrary, libraryHref } from "@/lib/library/params";
test("combined library view survives a URL round trip", () => {
  const p = parseLibrary({
    q: "diffusion",
    status: "to_read",
    sort: "title",
    page: "3",
    collection: "00000000-0000-4000-8000-000000000001",
  });
  expect(
    parseLibrary(
      Object.fromEntries(
        new URL(libraryHref(p), "https://paper.test").searchParams,
      ),
    ),
  ).toEqual(p);
});
test.each([
  { page: "-1" },
  { page: "9999999" },
  { status: "nope" },
  { sort: "random" },
  { collection: "bad" },
  { q: ["a", "b"] },
])("invalid library input resets safely: %j", (input) => {
  expect(parseLibrary(input)).toMatchObject({ invalid: true, page: 1 });
});
test("selecting another collection resets paging without losing search/status", () => {
  const p = parseLibrary({ q: "attention", status: "done", page: "4" });
  const href = libraryHref(p, {
    collection: "00000000-0000-4000-8000-000000000001",
    page: 1,
  });
  expect(href).toContain("q=attention");
  expect(href).toContain("status=done");
  expect(href).not.toContain("page=");
});
