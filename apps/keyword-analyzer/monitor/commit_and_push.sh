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

# 2026-05-19 fix:
# 이전 흐름은 `git add` → `git pull --rebase --autostash` 순서였으나, autostash가
# staged 변경을 stash로 빼고 pop할 때 modified 파일(latest.json, history.json)을
# unstaged 상태로 되돌리는 동작 → commit에서 누락되어 runs/ 새 파일만 push되던 버그.
# 해결: pull을 먼저(autostash로 unstaged 변경 보호) → 그 다음 add.
git pull --rebase --autostash origin main || { echo "[commit_and_push] git pull failed"; exit 2; }

git add apps/keyword-analyzer/data

if git diff --cached --quiet; then
  echo "[commit_and_push] no changes — skipping commit"
  exit 0
fi

# 확인 출력: 실제로 어떤 파일이 commit에 들어가는지 로그에 남김
echo "[commit_and_push] staged files:"
git diff --cached --name-only | sed 's/^/  /'

STAMP="$(date '+%Y-%m-%d %H:%M %Z')"
git commit -m "keyword monitor: ${STAMP}" || { echo "[commit_and_push] commit failed"; exit 3; }
git push origin main || { echo "[commit_and_push] push failed"; exit 4; }

echo "[commit_and_push] pushed successfully at ${STAMP}"
