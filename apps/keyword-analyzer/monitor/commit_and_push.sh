#!/bin/bash
# Commit + push keyword-analyzer data from WSL (reuses WSL git credentials).
# Called by run_and_push.bat AFTER the Windows Python monitor writes its
# output files to C:\dolmaro-tools\apps\keyword-analyzer\data\.

set -e

REPO_DIR="/mnt/c/dolmaro-tools"
cd "$REPO_DIR" || exit 1

# Ensure identity is set (idempotent)
git config user.email "dlfpomd@gmail.com"
git config user.name "dlfpomd"

# Stage the monitor's fresh output FIRST so the subsequent rebase/pull
# sees a clean working tree. (Previously `git pull --rebase` would fail
# with "You have unstaged changes" because the Python run just modified
# data/latest.json, data/history.json.)
git add apps/keyword-analyzer/data

# Pull latest to avoid non-fast-forward pushes. --autostash handles any
# other non-data uncommitted changes that may be lingering.
git pull --rebase --autostash origin main || { echo "[commit_and_push] git pull failed"; exit 2; }

if git diff --cached --quiet; then
  echo "[commit_and_push] no changes — skipping commit"
  exit 0
fi

STAMP="$(date '+%Y-%m-%d %H:%M %Z')"
git commit -m "keyword monitor: ${STAMP}" || { echo "[commit_and_push] commit failed"; exit 3; }
git push origin main || { echo "[commit_and_push] push failed"; exit 4; }

echo "[commit_and_push] pushed successfully at ${STAMP}"
