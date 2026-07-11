# Automated Claude PR reviewer (with gated auto-approve)

`.github/workflows/claude-review.yml` runs Claude on every pull request, posts a
review comment, and then — **gated on Claude's own verdict** — submits either an
**approving** or a **request-changes** review as a dedicated machine user. That
approval counts toward the `production` ruleset's "1 approving review + code-owner
review" requirement, so your own PRs can merge once Claude signs off.

## Why a machine user (and not the Action itself)

- The official `anthropics/claude-code-action` **cannot submit approvals** — it only
  comments. So a separate step submits the review via the GitHub CLI.
- The default `GITHUB_TOKEN` (`github-actions[bot]`) **cannot approve PRs** either;
  its approvals are ignored by rulesets. The step therefore uses a **machine-user
  Personal Access Token** (`REVIEW_BOT_TOKEN`).
- Your ruleset requires **code-owner** review, and code owners can only be **users or
  teams — never GitHub Apps**. So the approver must be a real (machine) *user* listed
  in `.github/CODEOWNERS`.

## What the gate does

Claude writes `{"verdict":"approve"|"request_changes","summary":"…"}` to
`claude-verdict.json`. The workflow reads it and:

- `approve` → bot submits an **approving** review (unblocks merge).
- anything else, or a missing/invalid file → bot submits **request-changes**
  (**fail-safe**: it never auto-approves on error).

It re-runs on every push (`synchronize`); your ruleset has
`dismiss_stale_reviews_on_push: true`, so each push is re-reviewed from scratch.

## One-time setup

1. **Create a machine account** on GitHub (e.g. `paperdeck-review-bot`) with its own
   email. This is a permitted machine/bot account — keep it separate from your
   personal identity.
2. **Add it to this repo** as a collaborator with **Write** access
   (Settings → Collaborators). Accept the invite from the bot account.
3. **Create a token for the bot** (while signed in as the bot). Because this repo is
   owned by a **personal** account and the bot is only a collaborator, use a **classic
   PAT** with the **`repo`** scope. (A *fine-grained* PAT will NOT work here — its
   resource owner can only be the bot's own account, so it can't be scoped to
   `khuynh22/paper-deck`. Fine-grained tokens only become an option if the repo moves
   to an org.)
4. **Mint a Claude subscription token** (as yourself, on a machine with Claude Code):
   run `claude setup-token`. It opens a browser, authenticates against your **Claude
   Pro/Max** plan, and prints a ~1-year OAuth token. This bills reviews against your
   subscription's usage limits — **no pay-per-use API credits**. (Free plan is not
   supported.)
5. **Add repo secrets** (Settings → Secrets and variables → Actions):
   - `CLAUDE_CODE_OAUTH_TOKEN` — the token from step 4. The workflow passes it to the
     action as an **env var** (the action has no OAuth input); Claude Code reads it via
     its auth precedence chain. To use API credits instead, delete this and set
     `ANTHROPIC_API_KEY` + switch the step back to the `anthropic_api_key:` input.
   - `REVIEW_BOT_TOKEN` — the bot PAT from step 3.
6. **Edit `.github/CODEOWNERS`** — replace `@REPLACE-WITH-REVIEW-BOT-USERNAME` with the
   bot's real `@username`. **Do this before merging** or PRs become unmergeable.

## Bootstrapping (important)

Installing this is itself a PR, and the `production` ruleset blocks all merges until
an approver exists — a chicken-and-egg. Merge this **first** PR via a one-time admin
action, then the bot handles everything afterward:

- Repo → **Settings → Rules → Rulesets → production**, set enforcement to **Disabled**
  (or add yourself to the **Bypass list**), merge this PR, then re-enable. *Or* add a
  permanent **Repository admin** bypass so you always retain a manual override.

## Cost & safety notes

- Each review consumes your Claude **subscription** usage (not API credits) via the
  OAuth token; `--max-turns 40` caps how much work one review can do. If the
  subscription's usage limit is hit, the action gets HTTP 429 and the Claude step
  errors — the gate then fails safe to request-changes. GitHub Actions minutes apply.
- The gate trusts Claude's self-reported verdict, and the workflow/prompt live in the
  repo — a PR that edits them could influence the outcome. Fine for a solo repo where
  you author every PR; revisit if you add external contributors (require human review
  for PRs that touch `.github/`).
- `REVIEW_BOT_TOKEN` can approve merges to `master` — treat it like a deploy key:
  store only as a secret, rotate periodically.
