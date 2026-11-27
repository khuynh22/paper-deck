const productionProjectRef = "rrbmucsbqsoyspsoftvl";

export function assertPreviewDatabase(env: Record<string, string | undefined>) {
  if (env.VERCEL_ENV !== "preview") return;

  const stagingRef = env.SUPABASE_STAGING_PROJECT_REF;
  if (
    !stagingRef ||
    stagingRef === productionProjectRef ||
    env.NEXT_PUBLIC_SUPABASE_URL !== `https://${stagingRef}.supabase.co`
  ) {
    throw new Error("Preview deployments require the isolated staging Supabase URL.");
  }

  if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Preview deployments require staging Supabase client and server keys.");
  }
}
