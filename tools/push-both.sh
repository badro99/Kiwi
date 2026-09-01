#!/usr/bin/env bash
# Kiwi · land the current HEAD on BOTH origin/<branch> and origin/main.
# This codifies the project rule (CLAUDE.md §1) so a missed second push can't
# cause branch drift. Usage:  tools/push-both.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
branch=$(git rev-parse --abbrev-ref HEAD)

git push origin "$branch"

if git push origin HEAD:main; then
  echo "✓ $branch and main both updated on origin"
else
  echo "✗ main push rejected (non-fast-forward). Someone pushed to main directly:" >&2
  echo "  git fetch origin && git merge origin/main   # then re-run tools/push-both.sh" >&2
  exit 1
fi

git log --oneline -1
