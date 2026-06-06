import { z } from "zod";

/**
 * Validated environment access. All secrets are optional at the type level so the
 * app boots locally without cloud keys; callers that truly need a key (e.g. the
 * service-role client) assert presence at the call site with a clear error.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SEMANTIC_SCHOLAR_API_KEY: z.string().optional(),
  SERPAPI_KEY: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  OWNER_EMAILS: z
    .string()
    .optional()
    .transform((s) =>
      s
        ? s
            .split(",")
            .map((v) => v.trim().toLowerCase())
            .filter(Boolean)
        : [],
    ),
});

export type Env = z.infer<typeof schema>;

export function readEnv(src: Record<string, string | undefined> = process.env): Env {
  return schema.parse(src);
}

export const env = (): Env => readEnv();

export function isOwner(email: string | null | undefined): boolean {
  if (!email) return false;
  return env().OWNER_EMAILS.includes(email.toLowerCase());
}
