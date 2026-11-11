import { getRefreshHealth, isSourceStale } from "@/lib/corpus/refreshHealth";

export async function RefreshHealth() {
  let health;
  try { health = await getRefreshHealth(); }
  catch { return <p role="status" className="mt-3 text-sm text-muted-foreground">Source health is unavailable.</p>; }
  return <details className="mt-3 rounded-xl border border-line p-3 text-sm">
    <summary className="cursor-pointer font-medium">Source refresh health</summary>
    {!health.sources.length && <p className="mt-2">No recorded refreshes yet. Source freshness is unknown.</p>}
    <ul className="mt-2 space-y-3">{health.sources.map(source => <li key={source.source_id}>
      <strong>{source.source_id}</strong>: {source.last_outcome.status}
      {isSourceStale(source.last_success_at, health.observedAt) ? " · stale" : ""}
      <p>{source.last_outcome.count} papers · {source.last_outcome.latencyMs} ms · Last successful fetch: {source.last_success_at ?? "never"}</p>
      {source.last_outcome.errors.map((error, index) => <p key={index}>{error}</p>)}
    </li>)}</ul>
    <h2 className="mt-4 font-medium">Recent refreshes</h2>
    <ul>{health.history.map(run => <li key={run.id}>
      {run.started_at}: {run.status === "running" && health.observedAt - Date.parse(run.started_at) > 90_000 ? "failed (lease expired)" : run.status}
      {run.finished_at ? ` · finished ${run.finished_at}` : ""}
      {run.error ? ` · ${run.error}` : ""}
    </li>)}</ul>
  </details>;
}
