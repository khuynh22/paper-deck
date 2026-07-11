/**
 * The app's absolute origin — needed for OpenGraph / canonical tags, which do not
 * unfurl with relative URLs. Resolved once with a precedence that works in every
 * environment; the value is fixed per deploy so reading it at module load is fine.
 */
function normalize(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Resolve the site origin from an env bag (extracted so it's unit-testable). */
export function resolveSiteUrl(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.NEXT_PUBLIC_SITE_URL;
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL;
  return normalize(explicit || (vercel ? `https://${vercel}` : "http://localhost:3000"));
}

export const SITE_URL: string = resolveSiteUrl();

export const paperPath = (id: string): string => `/paper/${id}`;
export const paperUrl = (id: string): string => `${SITE_URL}${paperPath(id)}`;
