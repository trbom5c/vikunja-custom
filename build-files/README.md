# Vikunja Custom Build

Automated build pipeline for a heavily customized [Vikunja](https://vikunja.io) Docker image. Clones upstream, patches ~95 source files across Go backend and Vue/TypeScript frontend, builds a single Docker image, and optionally pushes to GitHub and deploys to production.

## What's Different

This fork adds significant functionality on top of upstream Vikunja — all applied as a non-destructive patch layer that can be rebuilt against any upstream release.

### Gantt Chart (Major Overhaul)

- **Dependency arrows** between related tasks with configurable path modes (bezier, stepped, rounded), stroke, opacity, dash patterns, shadows, and multi/mono color palettes
- **Cascade scheduling** — drag a task and all downstream/upstream tasks offer to shift. Supports both bulk (shift all at once) and individual (step through one by one with skip/accept per task) modes
- **Ghost bar previews** — translucent preview bars show where cascaded tasks will land before you confirm
- **Drag confirm bubble** — inline floating confirmation on task drag with accept/cancel, task name, and day count
- **Drag date tooltip** — shows projected start–end date range below the bar while dragging, updates in real-time
- **Undo system** — revert the last drag+cascade operation
- **Pinch-to-zoom** — mobile two-finger zoom and trackpad Ctrl+scroll zoom on the timeline (10–80px/day range)
- **Mobile drag** — touch-aware hold-to-drag via native pointer/touch event API with threshold detection
- **Subproject color coding** — each subproject gets a distinct color on bars and legend dots in the toolbar
- **Arrow settings panel** — gear icon opens a comprehensive config panel for all arrow visual properties
- **Compact toolbar** — refactored options bar: date picker + checkboxes on left, subproject filter + settings on right
- **Overdue task bars** — striped pattern with red border, left-arrow indicator, pulsing animation, and overdue duration text (e.g., "3mo overdue")
- **Hover tooltips** — all bars show `[Project Name] Task Title — date range` on hover; overdue bars show original date range on second line

### Table View (Modernized)

- **Multi-column sorting** — click to sort, Ctrl+click to add columns. Cycle: desc → asc → remove
- **Sort indicator bar** — shows active sort columns as removable chips with priority numbers
- **Sortable Project column** — sorts by `project_id` on the backend
- **Sticky headers** — stay visible when scrolling long tables
- **Row styling** — alternating row backgrounds, hover highlight, done tasks dimmed to 55%
- **Project color accent** — left border on project names using the project's hex color
- **Percent done bar** — visual progress bar instead of plain percentage text
- **Row count footer** — "460 tasks · page 1 of 24"
- **Monospace IDs** — cleaner styling for task identifiers
- **Uppercase headers** — modern data-grid styling with letter-spacing

### Trello JSON Import

- **Client-side importer** — upload a Trello board `.json` export to import lists as sub-projects with all cards, labels, descriptions, checklists, due dates, and assignments
- **Reliable date handling** — bypasses the TaskModel pipeline (which silently drops dates) using raw `fetch()` with snake_case fields
- **Smart date mapping** — both start+due → full gantt range; start only → single-day bar; due only → endOnly bar with fade-in effect
- **Import statistics** — completion screen shows projects, tasks, labels, and dates-set counts
- **Import log** — scrollable output showing each operation

### Task Templates & Workflows

- **Task templates** — save any task as a reusable template (title, description, labels, assignees, priority, color). Create new tasks from templates with project selection
- **Task chains** — define multi-step task sequences with relative timing (offset + duration in hours/days/weeks/months). Create all tasks at once from an anchor date, auto-linked via precedes/follows relations
- **Chain step attachments** — file uploads per chain step with upload/delete endpoints
- **Drag-to-reorder** — composable for reordering chain steps via drag handles
- **Task duplication** — duplicate tasks within the same project preserving labels, assignees, attachments, comments

### Auto-Generated Tasks

- **Recurring task templates** — cron-based system that creates task instances when they become due, without cluttering the board with future tasks
- **One instance at a time** — only one open (undone) task per template can exist; if the previous isn't completed, it goes overdue naturally
- **Completion-based scheduling** — next due date recalculates from when the user completes the task, not when it was created
- **Pause/resume** — deactivate templates without deleting them
- **Manual trigger** — "Send to project now" button for immediate creation
- **Generation log** — tracks every creation with trigger type (system/manual/cron) and timestamps

### User Preferences (Account-Synced Settings)

- **Server-side preferences API** — `GET/POST/DELETE /api/v1/user/settings/preferences` with key-value storage
- **`useUserPreferences` composable** — loads from API on init, caches in reactive Map, debounced writes (800ms batching), localStorage fallback for offline/link shares
- **Auto-migration** — existing localStorage gantt settings automatically migrate to the server on first load
- **All gantt settings synced** — arrow config, cascade mode, cascade prompt style all persist across devices

### UI Polish

- **Project delete indicator** — loading spinner with task/project count during deletion, buttons hidden while in progress
- **Consistent page layouts** — Labels, Teams, Projects, Upcoming, Templates pages all use `content-widescreen` pattern
- **Home page** — current tasks above last-viewed projects; auto-task check on mount
- **Upcoming page** — filter bar with checkbox persistence, assigned-to-me filter
- **Task row layout** — title left-aligned, project name pushed right
- **Warning toasts** — proper toast severity for skip/warning messages

## Architecture

```
┌─────────────────────────────────────┐
│         vikunja-build.ps1           │  ← Orchestrator
├─────────────────────────────────────┤
│  build-files/  (~95 files)          │  ← Patch layer
│  ├── Go models, handlers, migrations│
│  ├── Vue components & views         │
│  ├── TypeScript composables & APIs  │
│  └── i18n translations              │
├─────────────────────────────────────┤
│  upstream Vikunja (cloned fresh)    │  ← Base
├─────────────────────────────────────┤
│  Docker multi-stage build           │  ← Output
│  (Node frontend + Go backend)       │
└─────────────────────────────────────┘
```

## Requirements

- Windows with PowerShell 5.1+
- Docker Desktop
- Git
- GitHub CLI (`winget install GitHub.cli`) — only for `-Release` flag

## Quick Start

```powershell
# First run — config wizard
.\vikunja-build.ps1

# Build and deploy
.\vikunja-build.ps1 -Deploy

# Full pipeline: build, push, release, deploy
.\vikunja-build.ps1 -Release -Deploy -CommitMsg "feat: description"

# Release with 'latest' tag on all repos
.\vikunja-build.ps1 -Release -Deploy -TagLatest -CommitMsg "feat: description"

# Fast iteration (reuse cloned source)
.\vikunja-build.ps1 -SkipClone -Deploy
```

## Flags

| Flag | Description |
|---|---|
| *(none)* | Patch + build Docker image |
| `-Commit` | Git add + commit before build |
| `-Push` | Push to fork (implies `-Commit`) |
| `-Release` | GitHub release with tar (implies `-Commit -Push`) |
| `-Deploy` | SCP tar to server + docker load + restart |
| `-TagLatest` | Push `latest` git tag to all repos (implies `-Release`) |
| `-CommitMsg "msg"` | Custom commit message (implies `-Commit`) |
| `-NoBuild` | Skip Docker build — use existing tar |
| `-Force` | Rebuild even if no files changed |
| `-SkipClone` | Reuse existing `vikunja-src/` |
| `-SkipExtract` | Skip zip check in `downloads/` |
| `-Setup` | Re-run config wizard |
| `-ShowConfig` | Display current config |
| `-WipeConfig` | Delete config and re-run wizard |

## Pipeline

```
 [1] Check downloads/ for update zip
 [2] Verify build-files/
 [3] Clone fresh from upstream
 [4] Patch source (~95 files into clone)
 [5] Auto-fix upstream compat
 [6] Change detection (SHA256 hash)
 [7] Docker build (multi-stage)
 [8] Save tar + timestamped backup
 [9] Git push + GitHub releases (all configured repos)
      └── Optional: push 'latest' tag (-TagLatest)
[10] Deploy via SSH
```

## Custom API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/autotasks` | List auto-task templates |
| PUT | `/api/v1/autotasks` | Create template |
| POST | `/api/v1/autotasks/:id` | Update template |
| DELETE | `/api/v1/autotasks/:id` | Delete template |
| POST | `/api/v1/autotasks/:id/trigger` | Manual trigger |
| POST | `/api/v1/autotasks/check` | Check all due templates |
| GET | `/api/v1/user/settings/preferences` | Get user preferences |
| POST | `/api/v1/user/settings/preferences` | Save preferences |
| DELETE | `/api/v1/user/settings/preferences/:key` | Delete preference |
| PUT | `/api/v1/tasks/:id/chains` | Create chain |
| POST | `/api/v1/chains/:id/create` | Create tasks from chain |

## Database Migrations

| ID | Description |
|---|---|
| 20260223120000 | Task templates table |
| 20260224040000 | Task chains + steps |
| 20260224050000 | Chain step attachments |
| 20260224060000 | Time unit columns on chain steps |
| 20260224070000 | Auto-task templates, log, attachments |
| 20260224080000 | Auto-task log: done tracking columns |
| 20260224090000 | Auto-task: last_completed_at |
| 20260224122023 | Auto-task cron registration |
| 20260227000000 | Auto-task: project_id → project_ids |
| 20260227010000 | Auto-task log: template snapshots |
| 20260227020000 | User preferences table |

## Directory Structure

```
vikunja-custom-build/
├── vikunja-build.ps1              ← Build orchestrator
├── build-files/                   ← Patch files (~95)
│   ├── *.go                       ← Models, handlers, migrations
│   ├── *.vue                      ← Components and views
│   ├── *.ts                       ← Services, composables, stores
│   └── en.json                    ← i18n
├── docs/
│   ├── PATCH_MANIFEST.md          ← File → target mapping
│   ├── AUTO_TASKS.md              ← Auto-task architecture
│   └── GANTT_FEATURES.md          ← Gantt enhancements
├── CHANGELOG.md
└── README.md
```

## Auto-Patches

Applied automatically every build to fix upstream compatibility:

- **Typesense bypass** — removes search dependency
- **xorm pointer fix** — `Update(ot)` → `Update(&ot)`
- **background.go** — signature fix
- **Dockerfile** — injects `go mod tidy`
- **UTF-8 no-BOM** — PowerShell 5.1 compat
