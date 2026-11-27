# Disabled Claude PR reviewer

The workflow in `.github/workflows/claude-review.yml` is retained but disabled
by its `false &&` job condition.

Re-enabling requires removing that guard, enabling the workflow in GitHub if
disabled there, and restoring valid subscription and bot credentials. Required
code-owner approval and CI still apply.
