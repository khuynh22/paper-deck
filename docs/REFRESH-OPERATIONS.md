# Refresh operations

Apply migration 0010 after 0009 before releasing the refresh callers. No secrets or
hosted settings are changed by this feature.

The owner feed shows source outcomes, fetched counts, elapsed milliseconds, last
successful fetch, and ten recent runs. A successful empty response is healthy.
A failed venue/query is listed explicitly; successes from other sources are kept.
A source with some papers and failed subrequests is partial. All-source failure,
or failure to ingest every fetched record, makes the run failed. Other mixed
outcomes are partial. Last-success timestamps survive later failures. No success
within 26 hours is stale (the existing cron is daily). A running record older than
90 seconds is displayed as expired even before the next run repairs its status.

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

Run npm test, npm run typecheck, npm run lint, npm run build, and
node scripts/test-ingestion-db.mjs. The disposable PostgreSQL harness covers
history, privileges, manual cooldown, expired leases, and simultaneous claims
in addition to the ingestion checks. Tests mock upstream responses and never call
live providers. CI now covers every PR base, including dependent branches.

A process killed before completion leaves a durable running record until the
next claim or owner view identifies lease expiry. Transport failure during
ingestion is unconfirmed: identified records remain safe to retry via issue46's
merge policy. This is bounded request execution, not a background job platform.
