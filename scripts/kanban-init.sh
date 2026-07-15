#!/usr/bin/env bash
# kanban-init.sh — (re)create the local SQLite kanban board.
#
# Usage:
#   ./scripts/kanban-init.sh                # create tasks/kanban.db if missing
#   ./scripts/kanban-init.sh --reset         # drop & recreate (DESTRUCTIVE)
#
# The database file is created at tasks/kanban.db (relative to repo root).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DB_DIR="$REPO_DIR/tasks"
DB="$DB_DIR/kanban.db"
SCHEMA="$SCRIPT_DIR/kanban-schema.sql"

mkdir -p "$DB_DIR"

if [[ "${1:-}" == "--reset" ]]; then
  echo ">> Resetting $DB (destructive)"
  rm -f "$DB" "$DB-journal" "$DB-wal" "$DB-shm"
fi

if [[ -f "$DB" ]]; then
  echo ">> Board already exists at $DB"
  echo ">> Ensuring schema is up to date..."
else
  echo ">> Creating new board at $DB"
fi

sqlite3 "$DB" < "$SCHEMA"
echo ">> Done. Task count: $(sqlite3 "$DB" 'SELECT COUNT(*) FROM tasks;')"
echo ">> Tip: sqlite3 \"$DB\" '.mode column' '.headers on' 'SELECT * FROM tasks;'"