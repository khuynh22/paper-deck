import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components.
 *
 * These two vars are read as static `process.env.NEXT_PUBLIC_*` member accesses
 * (not via `env()`/`schema.parse(process.env)`) on purpose: in the browser bundle
 * Next.js only inlines literal `process.env.NEXT_PUBLIC_X` references at build time
 * and does NOT ship a populated `process.env` object. Passing the whole object to
 * Zod yields `undefined` for these keys and throws. See lib/env.ts (server-only).
 */
export function browserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
