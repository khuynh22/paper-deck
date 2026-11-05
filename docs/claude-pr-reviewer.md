# Disabled Claude PR reviewer

Claude review is disabled after the subscription was canceled. The workflow is
retained in `.github/workflows/claude-review.yml`; its review job starts with a
`false &&` condition, so no Claude or review-posting steps run.

Re-enabling requires removing that guard, enabling the workflow in GitHub if
disabled there, and restoring valid subscription and bot credentials. The fork
and Dependabot checks remain in place. Use [GitHub code review](CODE-REVIEW.md)
for the Codex replacement and required approvals.
