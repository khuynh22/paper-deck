# PaperDeck staging

The persistent Supabase `staging` branch belongs to the `paper-deck` project.
All Vercel Preview deployments use this branch by default. They share test data
with each other; they are isolated from production, not from other previews.

| Environment | Supabase reference |
| --- | --- |
| Production | `rrbmucsbqsoyspsoftvl` |
| Staging | `xsnrhsrypqpoqcclhprl` |

The stable staging URL is
`https://paper-deck-staging-khuynh22s-projects.vercel.app`.
It points to the deployment selected for staging. Update that alias when choosing
a newer staging deployment; individual PR URLs are managed by Vercel normally.

## Credentials and login

Production credentials are scoped only to Vercel Production. Preview has separate
staging values for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY`. The service-role key stays server-only. Preview also
sets `SUPABASE_STAGING_PROJECT_REF`; `next.config.ts` rejects a preview build whose
URL differs from that reference or names the production project.

Use a separate staging account. Staging authentication redirects to its own site
and this project's team-scoped preview URLs. Configure staging email/OAuth secrets
separately; production accounts and provider secrets are not a staging login.
The staging owner email is configured in Preview's `OWNER_EMAILS`. A synthetic
owner account is reserved for isolated browser tests. Preview's `CRON_SECRET` is
empty, so scheduled-refresh requests are denied; an owner can use manual Refresh.

Environment changes affect new deployments. Previously deployed previews retain
their old credentials until those deployments are retired. Review old preview
deployments separately; never remove production deployments during that cleanup.

## Database changes

Staging starts without production rows. Seed test papers through Search arXiv or
manual Refresh and keep test users, marks, and notes disposable. Production-data
backup/restore rehearsals are a separate restricted workflow.

Its initial migration history was copied from production. The six equivalent
June timestamped migrations were reconciled to repository versions `0003`–`0008`
only on empty staging. The `0008` mark reset had no rows to change. `0009` and
`20261026061656` were then applied and recorded using their repository versions.
Production's history was not repaired. Do not repeat this reconciliation on a
populated database or assume production is ready for an automatic push.

Before a future migration, verify that the linked database reference is staging,
inspect the migration plan, then apply only the intended changes. Do not merge
the Supabase branch or enable automatic production migrations as part of PR tests.
See [INGESTION.md](INGESTION.md) for the production release procedure.

## Verification

Check the deployed browser's Supabase requests use `xsnrhsrypqpoqcclhprl`.
Test first/repeat import, Library, HTML/PDF readers, persisted marks, notes and
retry, and isolation between two staging accounts. Confirm test writes in the
staging database. Keep production checks read-only.

Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and the Vercel production build.
The deployment tests exercise the production-URL rejection and missing or
inconsistent staging configuration. A protected preview still requires Vercel
team access before application sign-in.
