# Refresh operations

Apply the pending `20261109205846_refresh_health.sql` migration after the existing
identity and application-access migrations, before releasing the refresh callers.
It replaces this PR's unpublished `0010_refresh_health.sql` so normal upgrades
remain in timestamp order. Preserve already-applied migration history; do not
replay historical `0008` or `0009`. No hosted migrations, secrets or settings are
changed by this PR.

The owner feed shows source outcomes, fetched counts, elapsed milliseconds, last
successful fetch, and ten recent runs. A successful empty response is healthy.
A failed venue/query is listed explicitly; successes from other sources are kept.
A source with some papers and failed subrequests is partial. All-source failure,
or failure to ingest every fetched record, makes the run failed. Other mixed
outcomes are partial. Last-success timestamps survive later failures. No success
within 26 hours is stale (the existing cron is daily). A running record older than
90 seconds is displayed as expired even before the next run repairs its status.

Confirmed insert/update/skip counts survive a later database transport failure.
Unconfirmed writes remain separate in the response and stored run history: they
make a mixed run partial, or failed when nothing could be confirmed. A deadline
that expires during ingestion stops further database requests and retains earlier
confirmed outcomes. The owner refresh message includes the unconfirmed count.
Malformed JSON/envelopes and non-Atom arXiv responses are format failures, never
healthy empty responses. Valid empty provider collections remain healthy.

Only the owner can trigger manual refresh or read operational history through the
app. Operational tables have RLS enabled, no public policies, and explicit access
revocation for anonymous/authenticated API roles. The service-only claim/finish
RPCs atomically serialize refresh ownership. Manual attempts have a five-minute
cooldown; cron ignores that cooldown but respects active leases. An expired lease
marks its old run failed and can be replaced; an old worker cannot finish a newer
run. The lease is 90 seconds, longer than the app's 60-second request budget.

Upstream work has a shared 35-second deadline. Each attempt includes both headers
and body, times out within six seconds, and permits at most three attempts.
Network failures, timeouts, HTTP 408/429/500/502/503/504 can retry with exponential
backoff. Retry-After seconds and HTTP dates are respected; a delay beyond the
remaining budget causes failure rather than an early retry. AsyncLocalStorage
keeps each concurrent source's deadline and warnings isolated. A 100 ms aggregate
grace allows aborted venue requests to return earlier successes. Database claim,
ingestion, and completion requests have 5/15/3-second transport budgets.

Cron returns 200 for healthy, 503 for partial/failed, 409 for an overlapping run,
and 500 if completion cannot be confirmed. Its JSON includes run ID and sanitized
outcomes. Logs use the fixed event paperdeck.refresh with status and failure
counts, never request URLs, API keys, or response bodies. Infrastructure owners
can alert on repeated non-200 cron responses, partial/failed events, and no source
success for 26 hours. No external alert delivery is configured by this change.

Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and
`node scripts/test-ingestion-db.mjs`. Set `TEST_INGESTION_HTTP=1` with the local
Supabase stack running to also exercise ingestion and refresh history through a
disposable PostgREST instance. The disposable PostgreSQL harness covers
history, privileges, manual cooldown, expired leases, and simultaneous claims
in addition to the ingestion checks, on both fresh and upgraded databases. HTTP
regressions verify persisted partial-run counts and unchanged freshness after
malformed provider responses. Tests mock upstream responses and never call live
providers. CI covers every PR base and runs the SQL database harness.

A process killed before completion leaves a durable running record until the
next claim or owner view identifies lease expiry. Transport failure during
ingestion is unconfirmed: identified records remain safe to retry via issue46's
merge policy. This is bounded request execution, not a background job platform.
