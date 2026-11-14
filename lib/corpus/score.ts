export function trendingScore(
  paper: { hf_upvotes: number; pwc_stars: number; published_at: string | null },
  now: number,
): number {
  const publishedAt = paper.published_at ? Date.parse(paper.published_at) : NaN;
  const ageDays = Number.isFinite(publishedAt) ? (now - publishedAt) / 86_400_000 : 3650;
  const recency = Math.exp(-Math.max(ageDays, 0) / 14);
  const attention = Math.max(paper.hf_upvotes, 0) * 3 + Math.log1p(Math.max(paper.pwc_stars, 0)) * 5;
  return attention * (0.3 + recency);
}
