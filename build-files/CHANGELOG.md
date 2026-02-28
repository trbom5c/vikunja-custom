# Vikunja Custom Build — Changelog

All notable changes to this custom Vikunja build.

## Phase 4: Trello Import + Kanban Archive (2026-02-28)

### Trello JSON Import (RC1 → Stable)
- Client-side Trello JSON import — no API keys or OAuth needed
- Three Kanban modes: Simple (To-Do/Done), Replicate Trello Board, Skip
- Replicate mode creates one Kanban column per Trello list with correct ordering
- Full metadata: labels (30 color variants), checklists as markdown, attachments as links
- Done status from `card.closed` and `card.dueComplete` + option toggle
- Date mapping optimized for Gantt (start/due → start_date/end_date/due_date)
- Real-time import log with Copy and Download (.log file)
- Import options: archived cards, closed lists, per-list toggles with card counts
- Verified with 460-task board — 0 errors
- Accessible via Migration hub (`/migrate`) with Trello JSON card

### Kanban Archive (Hide Done Tasks)
- "Archive" button in Kanban card dropdown menu — marks task as done (or undone to unarchive)
- "Hide done tasks" checkbox in Kanban header — filters out completed tasks from all columns
- Toggle state persisted per-project in localStorage
- Archived tasks remain in the project and are visible in List, Table, and Gantt views
- Unarchive via card menu restores task visibility when filter is toggled off

### Kanban Card Enhancements
- **Label color swatches** — Trello-style colored bars at top of card, hover shows label name
- **Date display mode** — "Relative dates" toggle in Kanban header switches between absolute ("Dec 8, 2025") and relative ("3 days ago"); hover always shows the inverse
- **Done-at timestamp** — completed tasks show when they were marked done (green check + date/relative time)
- **Done card styling** — completed tasks render at 65% opacity with strikethrough title
- Date mode synced across devices via user preferences API (`kanban-date-mode`)

### Documentation
- TrelloImport.vue and Migration.vue added to PATCH_MANIFEST.md
- Updated file counts

---

## Phase 3: Gantt Polish + User Preferences (2026-02-27)

### User Preferences API (Account-Synced Settings)
- New `user_preferences` table with unique `(user_id, key)` index
- `GET/POST/DELETE /api/v1/user/settings/preferences` endpoints
- `useUserPreferences` composable: loads from API, caches in reactive Map, debounced 800ms writes, localStorage fallback for offline/link shares
- Auto-migrates existing `gantt-*` localStorage keys to server on first load
- All gantt settings (arrow config, cascade mode, prompt style) now sync across devices
- Arrow config re-hydrates after preferences load via `watch(prefsLoaded)` to handle singleton timing

### Gantt Drag Date Tooltip
- Floating date range tooltip appears below bar while dragging
- Shows projected `Mar 22 – Mar 29` format, updates in real-time as bar slides
- rAF-tracked positioning anchored to `data-task-id` element

### Gantt Cascade Fixes
- **Bubble stuck on completion** — new `onCascadeClose` ref wired through composable → filters → GanttChart chain to dismiss bubble when cascade finishes or is dismissed
- **Only direct successors prompted** — rewrote `cascadeStepThrough` as async with `walkChain()` depth-first traversal to collect full chain (A→B→C→D shows "1 of 3", "2 of 3", "3 of 3")
- **Scrim intercepting clicks** — scrim now only renders during move phase, not cascade phase

### Gantt UX Improvements
- **Trackpad zoom** — Ctrl+scroll/pinch zooms gantt (10–80px/day), `preventDefault` blocks native browser zoom
- **Zoom hint** — subtle "Ctrl + scroll to zoom" text in toolbar
- **Button tooltips** — title attributes on all drag confirm and cascade buttons
- **Settings feedback** — "Saved" toast flashes when cascade mode or prompt style changes

### Toolbar Refactor
- Removed Card + FormField wrappers around gantt options
- Single compact toolbar: date picker + checkboxes left, subproject filter + settings + zoom hint right
- `.75rem` fonts, tight gaps, minimal vertical footprint

### Auto-Task Warning Toast
- `triggerNow()` catch block changed from `success()` to `warning()` for skip messages like "open task already exists"

### Build Script Updates
- Build-tools repo auto-pushed on release
- Configurable release repos via `-Setup` wizard
- `$fileMap` entries added for all new files (user_preference.go, user_preferences_handler.go, 20260227020000.go, userPreferencesApi.ts, useUserPreferences.ts)

---

## Phase 2g: Auto-Generated Tasks + Build Fixes (2026-02-24)

### Auto-Generated Task Templates
- Recurring templates that create task instances when due
- One open instance per template — no pile-up
- Completion-based scheduling (next due from completion, not creation)
- Pause/resume without deleting
- Manual "Send to project now" trigger
- Generation log with trigger type tracking
- Log truncation and schedule reset

### Backend
- `auto_task_template.go` — Model, CRUD, permissions
- `auto_task_create.go` — Check, trigger, completion handler
- `auto_task_handler.go` — API handlers (echo v5)
- `auto_task_cron.go` — Cron registration
- 4 migrations for tables, columns, cron

### Frontend
- `AutoTaskEditor.vue` — Card editor with pause/resume, trigger, log viewer
- `autoTaskApi.ts` — HTTP client
- Third "Auto-Generated" tab in Templates page
- Auto-check on Home page load
- 41+ i18n keys

### Build Compatibility
- All handlers updated to echo v5 patterns
- `auto_template_id` via raw SQL (not added to Task struct)
- Correct `createTask` 5-arg signature

---

## Phase 2f: Time Units + Filters (2026-02-24)

### Chain Step Time Units
- Hours, days, weeks, months for offset and duration
- Dropdown selectors in ChainEditor
- Backend unit-aware date math
- Migration adds `offset_unit`, `duration_unit` columns

### UI
- Task title left-aligned, project name right
- Assigned-to-me filter on Overview and Upcoming
- Filter bar visible on Overview
- Checkbox persistence in localStorage

---

## Phase 2e: Layout Consistency (2026-02-24)

### Page Layouts
- Labels, Teams, Projects, Upcoming, Templates: `content-widescreen` (900px), `<h2>` + description
- Home: current tasks above last-viewed
- Upcoming: checkbox state persistence

---

## Phase 2d: Drag-to-Reorder (2026-02-24)

### Chain Steps
- Drag handles with visual reordering via `useDragReorder.ts`

---

## Phase 2c: Chain Enhancements (2026-02-24)

### Step Descriptions & Attachments
- Rich text description per chain step (collapsible)
- File attachments per step with upload/delete

### Gantt
- Dependency arrows between related tasks
- Bar tooltips with task details

---

## Phase 2b: Task Chains (2026-02-24)

### Chain Workflow System
- Define task sequences with relative timing
- Create all tasks from anchor date
- Auto-linked via precedes/follows relations

---

## Phase 1: Task Templates & Duplication (2026-02-23)

### Task Templates
- Save any task as reusable template
- Create from template with project selection
- Template management page at `/templates`

### Task Duplication
- Duplicate within same project
- Preserves labels, assignees, attachments, comments
