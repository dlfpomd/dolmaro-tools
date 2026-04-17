#!/bin/bash
# Dolmaro blog-migrator dashboard sync
# Runs in WSL. Fetches ireaomd.co.kr RSS, updates posts.json, commits+pushes.

set -e

REPO_ROOT="/home/dolmaro/dolmaro-tools"
DATA_FILE="apps/blog-migrator/data/posts.json"
MONITOR_SCRIPT="apps/blog-migrator/monitor/sync-ireaomd.mjs"

cd "$REPO_ROOT" || exit 1
echo "[$(date '+%F %T')] sync start · cwd=$(pwd)"

# Load nvm / node path
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" >/dev/null 2>&1
if ! command -v node >/dev/null 2>&1; then
  NVM_NODE_BIN="$(ls -d "$HOME/.nvm/versions/node"/*/bin 2>/dev/null | tail -1)"
  [ -n "$NVM_NODE_BIN" ] && export PATH="$NVM_NODE_BIN:$PATH"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[!] node not found in PATH"
  exit 2
fi
echo "node version: $(node --version)"

# 1) Pull latest (avoid divergence with other bots)
git pull --rebase origin main || { echo "[!] git pull failed"; exit 3; }

# 2) Run sync (writes data/posts.json)
node "$MONITOR_SCRIPT"

# 3) Check for changes
if git diff --quiet HEAD -- "$DATA_FILE"; then
  echo "no changes in $DATA_FILE — skipping commit"
  exit 0
fi

# 4) Commit + push
git add "$DATA_FILE"
git commit -m "blog-migrator: daily sync $(date '+%Y-%m-%d %H:%M %Z')"
git push origin main

echo "[$(date '+%F %T')] sync done"
