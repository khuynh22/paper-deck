/**
 * The app's absolute origin — needed for OpenGraph / canonical tags, which do not
 * unfurl with relative URLs. Resolved once with a precedence that works in every
 * environment; the value is fixed per deploy so reading it at module load is fine.
 */
function normalize(url: string): string {
  return url.replace(/\/+$/, "");
}

const LOCAL = "http://localhost:3000";

/** Resolve the site origin from an env bag (extracted so it's unit-testable). */
export function resolveSiteUrl(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.NEXT_PUBLIC_SITE_URL;
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL;
  const candidate = normalize(explicit || (vercel ? `https://${vercel}` : LOCAL));
  // A malformed value (e.g. `ppdeck.com` with no scheme) must not crash the app:
  // SITE_URL feeds `new URL(...)` in the root layout's metadataBase. Fall back.
  try {
    new URL(candidate);
    return candidate;
  } catch {
    return LOCAL;
  }
}

export const SITE_URL: string = resolveSiteUrl();

export const paperPath = (id: string): string => `/paper/${id}`;
export const paperUrl = (id: string): string => `${SITE_URL}${paperPath(id)}`;
