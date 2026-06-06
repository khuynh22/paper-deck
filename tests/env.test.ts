import { test, expect } from "vitest";
import { readEnv, isOwner } from "@/lib/env";

const base = {
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
};

test("reads required public vars", () => {
  const e = readEnv(base);
  expect(e.NEXT_PUBLIC_SUPABASE_URL).toBe("http://localhost:54321");
  expect(e.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe("anon-key");
});

test("throws when a required var is missing", () => {
  expect(() => readEnv({})).toThrow();
});

test("owner list parses + lowercases csv", () => {
  const e = readEnv({ ...base, OWNER_EMAILS: "A@x.com, b@Y.com" });
  expect(e.OWNER_EMAILS).toEqual(["a@x.com", "b@y.com"]);
});

test("owner list defaults to empty array", () => {
  const e = readEnv(base);
  expect(e.OWNER_EMAILS).toEqual([]);
});

test("isOwner is case-insensitive and false on empty", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = base.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = base.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.OWNER_EMAILS = "owner@x.com";
  expect(isOwner("OWNER@x.com")).toBe(true);
  expect(isOwner("nobody@x.com")).toBe(false);
  expect(isOwner(null)).toBe(false);
});
