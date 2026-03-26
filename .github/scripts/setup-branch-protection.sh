#!/bin/bash
# GitHub CLI を用いて main ブランチの保護ルールを設定します。

set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "gh (GitHub CLI) が必要です。https://cli.github.com/ を参照してください。" >&2
  exit 1
fi

REPO_SLUG="${1:-}"
if [ -z "$REPO_SLUG" ]; then
  REPO_SLUG=$(gh repo view --json nameWithOwner -q .nameWithOwner)
fi

if [ -z "$REPO_SLUG" ]; then
  echo "対象リポジトリを取得できませんでした。引数で owner/repo を指定してください。" >&2
  exit 1
fi

echo "Setting branch protection rules for ${REPO_SLUG}@main"

CODEOWNERS_FILE=""
for candidate in ".github/CODEOWNERS" "CODEOWNERS" "docs/CODEOWNERS"; do
  if [ -f "$candidate" ]; then
    CODEOWNERS_FILE="$candidate"
    break
  fi
done

if [ -n "$CODEOWNERS_FILE" ]; then
  REQUIRE_CODE_OWNER_REVIEWS=true
  echo "Using CODEOWNERS from ${CODEOWNERS_FILE}"
else
  REQUIRE_CODE_OWNER_REVIEWS=false
  echo "CODEOWNERS file not found. Disabling code owner review requirement."
fi

gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "repos/${REPO_SLUG}/branches/main/protection" \
  --input - <<JSON
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "test (ubuntu-latest)",
      "test (macos-latest)",
      "test (windows-latest)",
      "Security Scan"
    ]
  },
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "require_code_owner_reviews": ${REQUIRE_CODE_OWNER_REVIEWS}
  },
  "enforce_admins": true,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false
}
JSON

echo "Branch protection configured successfully."
