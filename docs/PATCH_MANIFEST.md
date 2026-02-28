# Patch File Manifest

Every file in the `build-files/` directory and where it lands in the Vikunja source tree during the patch phase. Files marked **NEW** don't exist upstream; **REPLACE** overwrites the upstream version.

## Backend — Go Models (`pkg/models/`)

| File | Type | Description |
|------|------|-------------|
| tasks.go | REPLACE | Task model with cascade update support, typesense bypass |
| project.go | REPLACE | Project model modifications |
| task_collection.go | REPLACE | Task collection query modifications |
| task_chain.go | NEW | Chain template model, step struct with time units |
| task_from_chain.go | NEW | Create tasks from chain with unit-aware date math |
| task_template.go | NEW | Task template model and CRUD |
| task_from_template.go | NEW | Create task from saved template |
| task_duplicate.go | NEW | Task duplication with labels, assignees, attachments |
| auto_task_template.go | NEW | Auto-task template model, CRUD, permissions |
| auto_task_create.go | NEW | Auto-creation logic, trigger, completion handler |
| auto_task_cron.go | NEW | Cron registration for auto-task checking |
| user_preference.go | NEW | User preferences model, get/set/delete operations |

## Backend — Handlers (`pkg/routes/api/v1/`)

| File | Type | Description |
|------|------|-------------|
| chain_step_attachment.go | NEW | Upload/delete chain step attachments |
| auto_task_handler.go | NEW | Auto-task CRUD, trigger, check, log endpoints |
| user_preferences_handler.go | NEW | User preferences GET/POST/DELETE endpoints |

## Backend — Routes & Init

| File | Target | Type | Description |
|------|--------|------|-------------|
| routes.go | `pkg/routes/` | REPLACE | All API endpoint registrations |
| init.go | `pkg/initialize/` | REPLACE | App initialization with auto-task cron |

## Database Migrations (`pkg/migration/`)

| File | ID | Description |
|------|-----|-------------|
| 20260223120000.go | 20260223120000 | Task templates table |
| 20260224040000.go | 20260224040000 | Task chains + steps tables |
| 20260224050000.go | 20260224050000 | Chain step attachments table |
| 20260224060000.go | 20260224060000 | offset_unit, duration_unit on chain steps |
| 20260224070000.go | 20260224070000 | Auto-task templates, log, attachments; tasks.auto_template_id |
| 20260224080000.go | 20260224080000 | Auto-task log: task_done, task_done_at columns |
| 20260224090000.go | 20260224090000 | Auto-task templates: last_completed_at column |
| 20260224122023.go | 20260224122023 | Auto-task cron registration in init |
| 20260227000000.go | 20260227000000 | Auto-task: project_id → project_ids (JSON array) |
| 20260227010000.go | 20260227010000 | Auto-task log: template_title, project_name snapshots |
| 20260227020000.go | 20260227020000 | User preferences table with unique (user_id, key) index |

## Frontend — Services (`frontend/src/services/`)

| File | Type | Description |
|------|------|-------------|
| taskChainApi.ts | NEW | Chain API client, TimeUnit types, conversions |
| autoTaskApi.ts | NEW | Auto-task template API client |
| userPreferencesApi.ts | NEW | User preferences API client |
| taskCollection.ts | REPLACE | Task collection with modified queries |
| taskDuplicateService.ts | NEW | Task duplicate service |
| taskFromTemplateService.ts | NEW | Create-from-template service |
| taskTemplateService.ts | NEW | Template CRUD service |

## Frontend — Models (`frontend/src/models/`)

| File | Type | Description |
|------|------|-------------|
| task.ts | REPLACE | Task model with new fields |
| taskDuplicate.ts | NEW | Task duplicate model |
| taskFromTemplate.ts | NEW | Create-from-template model |
| taskTemplate.ts | NEW | Template model |

## Frontend — Model Types (`frontend/src/modelTypes/`)

| File | Type | Description |
|------|------|-------------|
| ITask.ts | REPLACE | Task interface with new fields |
| ITaskDuplicate.ts | NEW | Task duplicate interface |
| ITaskFromTemplate.ts | NEW | Create-from-template interface |
| ITaskTemplate.ts | NEW | Template interface |

## Frontend — Composables (`frontend/src/composables/`)

| File | Type | Description |
|------|------|-------------|
| useGanttArrowConfig.ts | NEW | Arrow config singleton with user preferences sync |
| useGanttBar.ts | REPLACE | Gantt bar positioning and rendering |
| useSubprojectColors.ts | NEW | Subproject color assignment |
| useDragReorder.ts | NEW | Drag-to-reorder composable |
| useTaskList.ts | REPLACE | Task list composable |
| useUserPreferences.ts | NEW | Account-synced preferences with API + localStorage fallback |

## Frontend — Gantt Components (`frontend/src/components/gantt/`)

| File | Type | Description |
|------|------|-------------|
| GanttChart.vue | REPLACE | Main chart: drag, cascade bubble, date tooltip, wheel zoom |
| GanttDependencyArrows.vue | NEW | SVG dependency arrows between bars |
| GanttArrowSettings.vue | NEW | Arrow config panel + cascade mode settings |
| GanttRowBars.vue | REPLACE | Bar rendering with tooltips and drag handles |
| GanttTimelineHeader.vue | REPLACE | Timeline header with zoom support |
| GanttVerticalGridLines.vue | REPLACE | Grid lines with zoom support |

## Frontend — Project Components & Views

| File | Target | Type | Description |
|------|--------|------|-------------|
| ProjectGantt.vue | `components/project/views/` | REPLACE | Gantt view with compact toolbar, preferences init |
| ProjectKanban.vue | `components/project/views/` | REPLACE | Kanban view |
| ProjectList.vue | `components/project/views/` | REPLACE | List view |
| ProjectTable.vue | `components/project/views/` | REPLACE | Table view |
| SubprojectFilter.vue | `components/project/partials/` | NEW | Subproject toggle + color legend |
| ProjectCard.vue | `components/project/partials/` | REPLACE | Project card display |

## Frontend — Task Components

| File | Target | Type | Description |
|------|--------|------|-------------|
| SingleTaskInProject.vue | `tasks/partials/` | REPLACE | Task row: title left, project right |
| ChainEditor.vue | `tasks/partials/` | NEW | Chain editor with time units, drag reorder |
| CreateFromChainModal.vue | `tasks/partials/` | NEW | Create tasks from chain |
| CreateFromTemplateModal.vue | `tasks/partials/` | NEW | Create task from template |
| AutoTaskEditor.vue | `tasks/partials/` | NEW | Auto-task editor with log, trigger, pause |
| SaveAsTemplateModal.vue | `tasks/partials/` | NEW | Save task as template |
| DuplicateTaskModal.vue | `tasks/partials/` | NEW | Duplicate task dialog |

## Frontend — Views (`frontend/src/views/`)

| File | Target | Type | Description |
|------|--------|------|-------------|
| Home.vue | `views/` | REPLACE | Tasks above last-viewed, auto-task check |
| ListTemplates.vue | `views/templates/` | NEW | 3-tab template manager |
| ListLabels.vue | `views/labels/` | REPLACE | Modernized layout |
| ListTeams.vue | `views/teams/` | REPLACE | Modernized layout |
| ListProjects.vue | `views/project/` | REPLACE | Modernized layout |
| ShowTasks.vue | `views/tasks/` | REPLACE | Filters, assigned-to-me |
| TaskDetailView.vue | `views/tasks/` | REPLACE | Task detail modifications |
| TrelloImport.vue | `views/migrate/` | NEW | Trello JSON import with 3 Kanban modes |
| Migration.vue | `views/migrate/` | REPLACE | Migration hub with Trello JSON link |

## Frontend — Gantt Helpers (`frontend/src/views/project/helpers/`)

| File | Type | Description |
|------|------|-------------|
| useGanttFilters.ts | REPLACE | Gantt filter composable with cascade wiring |
| useGanttTaskList.ts | REPLACE | Task list with cascade logic, chain walking, undo |

## Frontend — Other

| File | Target | Type | Description |
|------|--------|------|-------------|
| index.ts | `router/` | REPLACE | Router with template routes |
| tasks.ts | `stores/` | REPLACE | Task store with cascade support |
| en.json | `i18n/lang/` | REPLACE | All translation keys |
| messageIndex.ts | `message/` | REPLACE | Toast message helpers |
| Navigation.vue | `components/home/` | REPLACE | Nav with template links |
| Notification.vue | `components/misc/` | REPLACE | Notification component |
| PoweredByLink.vue | `components/home/` | REPLACE | Footer with build version |
| KanbanCard.vue | `tasks/partials/` | REPLACE | Kanban card display |

## Documentation

| File | Target | Description |
|------|--------|-------------|
| README.md | `/` | This project's documentation |
| CHANGELOG.md | `/` | Full changelog for all phases |
| PATCH_MANIFEST.md | `docs/` | This file |
| AUTO_TASKS.md | `docs/` | Auto-task architecture doc |

## File Counts

- **Total patch files:** ~94
- **New files (don't exist upstream):** ~48
- **Replaced files (overwrite upstream):** ~43
- **Documentation:** 4
- **Go backend files:** ~28
- **Vue/TS frontend files:** ~62
