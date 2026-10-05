# Browser persistence tests

Requires Node 22+, pnpm and Docker. No hosted Supabase credentials are used.

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium
pnpm test:e2e:setup
pnpm test:e2e
```

Setup starts the separate `paper-deck-e2e` Supabase project on API port 55421
and database port 55422, then resets **only that disposable project** and applies
the repository migrations. Existing local development projects are untouched.
Test credentials are captured in ignored `.e2e/env.json`; never commit or upload
that file or `.e2e/setup-error.log`. The web server uses only those local keys.
The suite builds and serves the production bundle. Port 3102 must be free.
Each scenario creates unique users and papers and cleans
up its own records. Do not run two suites against the same project concurrently.

The Chromium desktop and mobile viewport projects cover authentication guards,
library save/remove, HTML progress, highlights and notes across reload and a second
session, lost-response retry without duplicate highlights, PDF fallback with a
local PDF/worker fixture, and direct authenticated RLS checks plus a second user's
UI. They check persisted rows rather than relying on optimistic UI state.

CI starts from a clean database. Failure traces and screenshots are retained for
seven days; they contain only disposable test users and fixtures. Inspect locally
with `pnpm exec playwright show-trace test-results/<test>/trace.zip`.

Negative-control validation: temporarily disabling `stars` RLS in the disposable
database made the second-user test fail at its empty-result assertion with the
first user's row. RLS was restored immediately afterward. Callback tests also
reproduced and now prevent an external redirect via `next=@evil.test`.
The HTML journey saves a nonzero block anchor and checks its exact viewport
position after reload and in a second context. This exposed a parent-relative
`offsetTop` calculation; both readers now resume using document coordinates.

Known development limitation: the existing webpack dev server throws inside
pdf.js when opening the PDF fixture. The production bundle passes both PDF cases;
the harness uses the same production bundler as CI builds.

To stop the test project after use:

```sh
npm exec --yes --package=supabase@2.119.0 -- supabase stop --workdir tests/e2e
```
