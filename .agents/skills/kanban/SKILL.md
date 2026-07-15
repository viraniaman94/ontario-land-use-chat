---
name: kanban
description: Track and manage work on a local SQLite kanban board via the scripts/kanban CLI. Use when starting a unit of work, picking up the next task, moving tasks across columns, listing the board, or logging progress. Keeps a persistent, queryable task list that survives across sessions.
---

# Kanban Task Tracking Skill

This skill manages a local SQLite kanban board at `tasks/kanban.db` (schema in
`scripts/kanban-schema.sql`). All interactions go through the **`scripts/kanban`**
CLI wrapper — do not hand-write `sqlite3` queries. The board is the durable
source of truth for work state across sessions.

## When to use

- **Starting a session or unit of work** → `scripts/kanban list` to see the
  board, then `scripts/kanban start <id>` when you begin a task.
- **Creating tasks** → when breaking down a feature or bug into subtasks, add
  them with `scripts/kanban add`.
- **Moving work** → `scripts/kanban move <id> <status>` as a task progresses
  (backlog → todo → in_progress → review → done). Shortcuts: `start`, `review`,
  `done`, `cancel`, `block`, `todo`.
- **Finishing** → `scripts/kanban done <id>` on completion; log a note with
  `scripts/kanban note <id> "<text>"`.
- **Handing off / resuming** → `scripts/kanban list` + `scripts/kanban show <id>`
  to rebuild context. The activity log preserves full history.

Prefer this board over the in-context `manage_todo_list` tool for any
multi-session work. The in-context todo list is fine only for tiny within-turn
checklists; the kanban board is the source of truth for durable work state.

## Setup

```bash
scripts/kanban init           # create tasks/kanban.db if missing
scripts/kanban init --reset   # destructive: drop & recreate
```

The CLI works from any cwd (it resolves the repo root from its own location).
No external deps — it uses the system `sqlite3` CLI.

## Columns

`backlog` → `todo` → `in_progress` → `review` → `done` (+ `cancelled`).

## Commands

Run `scripts/kanban help` for the full reference. Quick map:

| Command | Purpose |
|---|---|
| `scripts/kanban list [--all]` | Board grouped by column (hidden: cancelled) |
| `scripts/kanban counts` | Status counts |
| `scripts/kanban add <id> "<title>" [opts]` | Add a task |
| `scripts/kanban show <id>` | Task row + activity history |
| `scripts/kanban move <id> <status>` | Change status (logs activity) |
| `scripts/kanban start <id>` | → `in_progress` |
| `scripts/kanban review <id>` | → `review` |
| `scripts/kanban done <id>` | → `done` |
| `scripts/kanban cancel <id>` | → `cancelled` |
| `scripts/kanban block <id>` | → `backlog` |
| `scripts/kanban todo <id>` | → `todo` |
| `scripts/kanban edit <id> [opts]` | Edit fields (logs activity) |
| `scripts/kanban note <id> "<text>"` | Append a comment to the activity log |
| `scripts/kanban search "<query>"` | Full-text search open tasks (title+desc) |
| `scripts/kanban tag "<tag>"` | List open tasks matching a tag |
| `scripts/kanban subtasks <parent_id>` | List a parent's subtasks |
| `scripts/kanban reorder <id> <n>` | Set column_order within current column |
| `scripts/kanban delete <id>` | Delete a task (prefer `cancel`) |
| `scripts/kanban columns` | Print valid statuses |
| `scripts/kanban init [--reset]` | (Re)create the board |

### `add` options

`--status=<s>` (default `todo`), `--priority=<p>` (default `medium`), `--tags=a,b`,
`--desc="<text>"`, `--assignee=<who>`, `--parent=<id>`.

### `edit` options

`--title=`, `--desc=`, `--priority=`, `--assignee=`, `--tags=`.

Valid priorities: `low`, `medium`, `high`, `urgent`.
Valid statuses: `backlog`, `todo`, `in_progress`, `review`, `done`, `cancelled`.

## Typical workflow

```bash
# See what's open
scripts/kanban list

# Pick up work
scripts/kanban start fix-auth-redirect

# Break it down
scripts/kanban add fix-auth-redirect-unit "Add unit test for redirect" --parent=fix-auth-redirect --tags=test

# Log progress / findings
scripts/kanban note fix-auth-redirect "Root cause: middleware checked session twice."

# Finish
scripts/kanban done fix-auth-redirect
```

## Id conventions

Use short, stable, kebab-case ids that describe the work
(`fix-auth-redirect`, `add-r2-doc-cache`) — never `task-3`, and never reuse an id.

## Best practices

- **One source of truth.** When a task is on the board, the board is
  authoritative. Don't keep a parallel in-context todo list for the same items.
- **Always go through `scripts/kanban`.** It quotes values safely, validates
  statuses/priorities, and writes the `task_activity` audit rows for you.
  Hand-writing `sqlite3` queries bypasses validation and history logging.
- **Move before you work, done when you finish.** `start` when you pick up,
  `done` when you complete.
- **The `.db` file is tracked; sidecars are gitignored.** `tasks/kanban.db` is
  committable for a snapshot; `*.db-wal/-shm/-journal` are ignored (see `.gitignore`).
- **No external deps.** Everything uses the system `sqlite3` CLI.