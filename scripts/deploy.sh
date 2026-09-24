#!/bin/sh
# Update the live server (the clone MCP clients run) to what's pushed to origin/main, then rebuild it.
# Work in this checkout never reaches the live server until it's merged to main and pushed.
#
# Usage: npm run deploy   (then reconnect the server in each MCP client)
# Override the location with OMNIFOCUS_MCP_LIVE_DIR.
set -eu

LIVE_DIR="${OMNIFOCUS_MCP_LIVE_DIR:-$HOME/.local/share/omnifocus-mcp}"
REPO_URL="https://github.com/agentheath/omnifocus-mcp.git"

if [ ! -d "$LIVE_DIR/.git" ]; then
  echo "Cloning $REPO_URL into $LIVE_DIR"
  git clone --quiet --branch main "$REPO_URL" "$LIVE_DIR"
else
  # --ff-only fails loudly if someone committed in the live clone instead of silently merging.
  git -C "$LIVE_DIR" pull --quiet --ff-only origin main
fi

# Flag local work that this deploy won't include.
if git rev-parse --verify --quiet main >/dev/null; then
  git fetch --quiet origin main
  unpushed=$(git rev-list --count origin/main..main)
  if [ "$unpushed" -gt 0 ]; then
    echo "Note: $unpushed commit(s) on local main aren't pushed, so they're not deployed."
  fi
fi

cd "$LIVE_DIR"
npm ci --silent --no-audit --no-fund
npm run --silent build

version=$(node -p 'require("./package.json").version')
commit=$(git rev-parse --short HEAD)
echo "Deployed omnifocus-mcp $version ($commit) to $LIVE_DIR/dist/index.js"
echo "Reconnect it: /mcp in Claude Code; quit and reopen Claude Desktop."
