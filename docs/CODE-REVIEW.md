# GitHub code review

Claude PR review is disabled because the Claude subscription was canceled. Its
workflow was disabled in GitHub and removed from this branch. Existing CI,
Dependabot, repository rules, and code-owner assignments remain in place.

## Codex through ChatGPT

Use the native Codex GitHub integration for subscription-backed reviews. It
supports automatic reviews and explicit `@codex review` requests, and reads
`## Code Review Rules` from the repository's `AGENTS.md` files. PaperDeck's rules
cover import identity/preservation, user-data ownership, and external reader HTML.

Account setup must be completed by the repository owner:

1. Open [Codex code review settings](https://chatgpt.com/settings/code-review)
   with the intended ChatGPT account.
2. If `khuynh22/paper-deck` is not connected, review the GitHub app's requested
   permissions and authorize only this repository. This task has not granted app
   or OAuth access, and the local ChatGPT CLI login does not prove that GitHub is
   connected to native reviews.
3. Select the repository and enable **Automatic review** under **Review code**.
   Check personal preferences and the review trigger to choose when it runs.
4. For a one-off review after setup, post `@codex review` on a representative PR
   and verify that Codex reacts and reviews its current diff. No review-triggering
   comment has been posted by this task.

Native GitHub review is available with eligible ChatGPT plans, including Plus and
Pro, and uses Codex code-review usage. Check the account's current plan, workspace
controls, and usage before enabling it; no credits or subscription were purchased.
See the official [GitHub review guide](https://learn.chatgpt.com/docs/third-party/github)
and [pricing/usage guidance](https://learn.chatgpt.com/docs/pricing).

## Official GitHub Action alternative

OpenAI also publishes `openai/codex-action@v1`. Its documented setup uses an
`OPENAI_API_KEY` secret and API billing, separately from ChatGPT subscription
usage. It fits custom CI review pipelines, but no API key, active API workflow,
or paid inference has been configured here. Choosing that route requires an
explicit billing/access decision first. See the official
[Codex GitHub Action guide](https://learn.chatgpt.com/docs/github-action).

## Approval and merge requirements

Codex feedback supplements CI and human review. It does not replace required
approvals, resolve review threads, dismiss existing reviews, or merge a PR.
The active `production` ruleset still requires one approval, code-owner review,
resolved review threads, and the **Lint, typecheck, test** and **Production build**
checks. Its Copilot review rule is also unchanged. The existing owner remains
`@CaffeinatedSimon`; no GitHub App was substituted as a code owner.

An existing changes-requested review remains visible after disabling Claude.
An authorized reviewer must handle it through the normal review process; this
task has not dismissed it or relaxed branch protections.
