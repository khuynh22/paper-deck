# Refresh operations

For maintainers investigating a failed or stalled refresh. Sign in as an
`OWNER_EMAILS` user, open the feed, and expand **Source refresh health**.

## Read the result

| Result | Meaning |
| --- | --- |
| Healthy | The source or run completed successfully; an empty source response can be healthy. |
| Partial | Some sources, venues, queries, or imports failed. Successful results are kept. |
| Failed | The refresh failed. Inspect the source errors and import counts before retrying. |
| Stale | A source has no successful fetch within 26 hours. This can appear alongside another result. |

The panel shows the latest source outcomes and ten recent runs. Last-success
timestamps survive later failures. Confirmed added/updated/skipped counts remain
recorded when a later batch fails; unconfirmed writes are reported separately.

## Recover a refresh

- **HTTP 429 or provider failure:** inspect the named source, venue, or query.
  Retries respect provider backoff and have a bounded deadline. Wait before
  trying again; check [source configuration](DEPLOY.md#source-notes) for optional
  API keys. A partial result alone is not evidence of an application outage.
- **Cooldown:** manual refreshes require five minutes between starts.
- **Already running:** wait for the active refresh. A running record older than
  90 seconds is shown as expired; reload and retry. The next claim marks the old
  run failed and replaces its lease.
- **Unconfirmed imports:** retry after the cooldown. Existing paper identities
  and confirmed metadata are preserved by the [ingestion merge policy](INGESTION.md).

Only owners can see these controls and history through the app. Direct access to
the operational tables and claim/finish functions is restricted to the server's
service role.

## Check scheduled refreshes

Cron runs daily and respects active leases, but skips the manual cooldown.

| HTTP status | Result |
| --- | --- |
| 200 | Healthy |
| 503 | Partial or failed; inspect the JSON source outcomes and import counts |
| 409 | Another refresh owns the lease |
| 500 | Completion could not be confirmed |

Filter Vercel runtime logs for `paperdeck.refresh` to see status and failure
counts. Investigate repeated failures or a source with no success for 26 hours.
External alert delivery must be configured separately.

## Deploy or roll back

Apply `20261110005752_refresh_health.sql` after the identity and application-access
migrations, before deploying callers. It was applied and verified in staging and
production on November 9, 2026 (Pacific). Preserve existing migration history;
do not replay historical `0008` or `0009` migrations.

If the release introduces feed/search HTTP 5xx responses or database
claim/completion errors, use [Vercel Instant Rollback](https://vercel.com/docs/instant-rollback)
to restore the previous production deployment. Keep the additive database
migration in place so operational history is retained. Confirm the feed and
search load successfully after rollback.

## Verify a change

With dependencies installed and local Supabase running, run:

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
node scripts/test-ingestion-db.mjs
```

The database harness creates and removes disposable databases. Success reports
`Refresh database checks passed` and `Database ingestion checks passed`.
For a hosted check, use the isolated [staging environment](DEPLOY.md#staging):
verify owner progress/results, history after reload, cooldown, two-tab overlap,
and hidden controls/history for anonymous visitors and signed-in non-owners.
