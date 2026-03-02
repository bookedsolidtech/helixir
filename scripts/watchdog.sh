#!/usr/bin/env bash
# watchdog.sh — Monitors the wc-tools protoLabs board and wakes up auto-mode if stalled.
#
# Usage: ./scripts/watchdog.sh
# Runs indefinitely. Ctrl+C to stop.
#
# What it does every 5 minutes:
#   1. Reads the board via .automaker/features/*.json
#   2. Reports backlog/in-progress/blocked counts
#   3. If blocked > 0, alerts loudly
#   4. If auto-mode appears stalled, prints a reminder to restart it
#
# Requirements: jq

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FEATURES_DIR="$PROJECT_ROOT/.automaker/features"
INTERVAL_SECONDS=300  # 5 minutes

count_by_status() {
  local status="$1"
  local count=0
  for f in "$FEATURES_DIR"/*/feature.json; do
    [[ -f "$f" ]] || continue
    local s
    s=$(jq -r '.status // "unknown"' "$f" 2>/dev/null || echo "unknown")
    if [[ "$s" == "$status" ]]; then
      ((count++)) || true
    fi
  done
  echo "$count"
}

list_by_status() {
  local status="$1"
  for f in "$FEATURES_DIR"/*/feature.json; do
    [[ -f "$f" ]] || continue
    local s
    s=$(jq -r '.status // "unknown"' "$f" 2>/dev/null || echo "unknown")
    if [[ "$s" == "$status" ]]; then
      local title
      title=$(jq -r '.title // "untitled"' "$f" 2>/dev/null || echo "untitled")
      local id
      id=$(jq -r '.id // "unknown-id"' "$f" 2>/dev/null || echo "unknown-id")
      echo "  [$id] $title"
    fi
  done
}

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

log "=== wc-tools board watchdog started (interval: ${INTERVAL_SECONDS}s) ==="
log "Project: $PROJECT_ROOT"
log "Press Ctrl+C to stop."
echo ""

while true; do
  backlog=$(count_by_status "backlog")
  in_progress=$(count_by_status "in-progress" || count_by_status "in_progress")
  blocked=$(count_by_status "blocked")
  done=$(count_by_status "done")

  log "Board: backlog=$backlog | in-progress=$in_progress | blocked=$blocked | done=$done"

  if [[ "$blocked" -gt 0 ]]; then
    log "⚠️  WARNING: $blocked BLOCKED feature(s) detected!"
    list_by_status "blocked"
    log "Action needed: investigate and unblock manually, or run /ava to fix."
  fi

  if [[ "$backlog" -gt 0 && "$in_progress" -eq 0 ]]; then
    log "⚠️  WARNING: $backlog backlog items but nothing in-progress — auto-mode may be stalled!"
    log "Action: restart auto-mode via protoLabs Studio or run: claude \"/ava check board\" $PROJECT_ROOT"
  fi

  if [[ "$backlog" -eq 0 && "$in_progress" -eq 0 && "$blocked" -eq 0 ]]; then
    log "✓ Board is clean. All features done."
  fi

  sleep "$INTERVAL_SECONDS"
done
