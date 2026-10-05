/** Reference policy shared by application tests and the database regression harness. */
export function trendingScore(
  p: { hf_upvotes: number; pwc_stars: number; published_at: string | null },
  now: number,
): number {
  const ageDays = p.published_at ? (now - Date.parse(p.published_at)) / 86_400_000 : 3650;
  const recency = Math.exp(-Math.max(ageDays, 0) / 14);
  const attention = p.hf_upvotes * 3 + Math.log1p(p.pwc_stars) * 5;
  return attention * (0.3 + recency);
}
