import { expect, test } from "vitest";
import { assertPreviewDatabase } from "@/lib/deployment";

const staging = {
  VERCEL_ENV: "preview",
  SUPABASE_STAGING_PROJECT_REF: "staging-project",
  NEXT_PUBLIC_SUPABASE_URL: "https://staging-project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "staging-anon",
  SUPABASE_SERVICE_ROLE_KEY: "staging-service",
};

test("accepts a configured staging preview", () => {
  expect(() => assertPreviewDatabase(staging)).not.toThrow();
});

test("rejects production even when both preview settings point at it", () => {
  expect(() => assertPreviewDatabase({
    ...staging,
    SUPABASE_STAGING_PROJECT_REF: "rrbmucsbqsoyspsoftvl",
    NEXT_PUBLIC_SUPABASE_URL: "https://rrbmucsbqsoyspsoftvl.supabase.co",
  })).toThrow("isolated staging");
});

test.each([undefined, "https://rrbmucsbqsoyspsoftvl.supabase.co", "https://other.supabase.co"])(
  "rejects an unexpected preview URL: %s",
  (url) => {
    expect(() => assertPreviewDatabase({ ...staging, NEXT_PUBLIC_SUPABASE_URL: url }))
      .toThrow("isolated staging");
  },
);

test("rejects a missing staging reference or server key", () => {
  expect(() => assertPreviewDatabase({ ...staging, SUPABASE_STAGING_PROJECT_REF: undefined }))
    .toThrow("isolated staging");
  expect(() => assertPreviewDatabase({ ...staging, SUPABASE_SERVICE_ROLE_KEY: undefined }))
    .toThrow("client and server keys");
});

test.each([undefined, "development", "production"])("keeps %s configuration independent", (target) => {
  expect(() => assertPreviewDatabase({ VERCEL_ENV: target })).not.toThrow();
});
