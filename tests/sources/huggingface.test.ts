import { test, expect } from "vitest";

test("distinguishes absent signals from explicitly supplied zero", () => {
  expect(parseHfDaily([{ paper: { id: "2601.12345", title: "T" } }])[0].signals.hfUpvotes).toBeUndefined();
  expect(parseHfDaily([{ paper: { id: "2601.12345", title: "T", upvotes: 0 } }])[0].signals.hfUpvotes).toBe(0);
});
import { readFileSync } from "node:fs";
import { parseHfDaily } from "@/lib/sources/huggingface";

const json = JSON.parse(readFileSync("tests/fixtures/hf-daily.json", "utf8"));

test("maps the paper id to arxivId and upvotes to a signal", () => {
  const [p] = parseHfDaily(json);
  expect(p.arxivId).toBe("2606.01234");
  expect(p.signals.hfUpvotes).toBe(87);
  expect(p.authors).toEqual(["Jane Roe", "John Doe"]);
  expect(p.pdfUrl).toBe("https://arxiv.org/pdf/2606.01234");
});

test("drops items without an arxiv id", () => {
  expect(parseHfDaily(json)).toHaveLength(1);
});

test("returns empty for non-array input", () => {
  expect(parseHfDaily({})).toEqual([]);
  expect(parseHfDaily(null)).toEqual([]);
});
