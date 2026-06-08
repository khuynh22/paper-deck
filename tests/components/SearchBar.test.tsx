import { test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SearchBar } from "@/components/SearchBar";

test("renders a GET search form to /search with a q input", () => {
  render(<SearchBar />);
  const input = screen.getByRole("searchbox", { name: /search papers/i });
  expect(input).toHaveAttribute("name", "q");
  const form = input.closest("form")!;
  expect(form).toHaveAttribute("action", "/search");
  expect(form).toHaveAttribute("method", "get");
});

test("prefills the input from defaultValue", () => {
  render(<SearchBar defaultValue="diffusion models" />);
  expect(screen.getByRole("searchbox", { name: /search papers/i })).toHaveValue(
    "diffusion models",
  );
});
