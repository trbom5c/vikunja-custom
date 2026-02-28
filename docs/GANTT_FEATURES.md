# Gantt Chart Enhancements

Comprehensive overview of all customizations to Vikunja's Gantt chart.

## Dependency Arrows

SVG arrows drawn between tasks that have `precedes`/`follows` relations.

### Path Modes
- **Bezier** — smooth curves with configurable control points (cp1X/cp1Y, cp2X/cp2Y)
- **Stepped** — right-angle paths with configurable exit/entry directions and lengths
- **Step Rounded** — stepped paths with rounded corners (configurable radius)

### Visual Config
All settings accessible via gear icon in the gantt toolbar:

| Setting | Range | Default |
|---------|-------|---------|
| Stroke width | 0.5–5px | 1.5px |
| Dash pattern | any SVG dasharray | `2,2` |
| Opacity | 0–1 | 0.5 |
| Arrow size | 0–20px | 8px |
| Show dots | on/off | off |
| Dot radius | 1–10px | 3px |
| Show shadow | on/off | off |
| Shadow width | 1–10px | 4px |
| Shadow opacity | 0–1 | 0.2 |
| Color palette | multi/mono | multi |
| Corner radius (stepped) | 0–30px | 11px |
| Exit/entry direction | right/bottom, left/top | bottom/left |
| Exit/entry length | 0–100px | 30/20px |

Settings persist to user account via the preferences API.

### Implementation
- `GanttDependencyArrows.vue` — SVG overlay rendering
- `useGanttArrowConfig.ts` — Reactive singleton config with auto-save
- `GanttArrowSettings.vue` — Config panel UI with sliders, dropdowns, import/export

## Cascade Scheduling

When a task is dragged, downstream (or upstream) tasks connected by dependency arrows can be shifted to maintain relative timing.

### Modes

**Bulk mode** (default): All downstream tasks shift at once with a single confirm/skip prompt.

**Individual mode**: Step through each downstream task one by one:
- Shows "Task Name — 1 of N" with shift/skip/cancel buttons
- `✓` shifts the current task
- `→` skips (leaves unshifted)
- `✕` cancels all remaining
- Full chain walking via depth-first traversal

### Ghost Bar Previews
Translucent bars appear at the projected positions during cascade confirmation, using the subproject color at reduced opacity.

### Confirm Bubble
Floating bubble anchored to the task bar via `requestAnimationFrame` tracking:
- Move phase: task name, day count + direction, confirm/cancel
- Cascade phase: task name, shift amount, accept/skip/cancel with counter

### Undo
After a cascade operation, an "Undo" button appears in the toolbar to revert all shifted tasks to their original positions.

## Drag & Zoom

### Drag Behavior
- **Desktop**: click-and-drag with grabbing cursor
- **Mobile**: hold-to-activate (threshold detection), then drag via touch events
- **Both**: pointer threshold prevents accidental drags from clicks/taps

### Drag Date Tooltip
While dragging, a small tooltip below the bar shows the projected date range (`Mar 22 – Mar 29`), updating in real-time via rAF.

### Zoom
- **Mobile**: two-finger pinch gesture
- **Desktop**: Ctrl + scroll wheel / trackpad pinch
- Range: 10–80 px/day
- `preventDefault` blocks native browser zoom during gantt interaction
- "Ctrl + scroll to zoom" hint in toolbar

## Subproject Colors

When "Include all sub-projects" is enabled:
- Each subproject gets a unique color from a predefined palette
- Task bars render with their subproject's color
- Color legend dots appear in the toolbar next to project names
- Colors assigned via `useSubprojectColors.ts` composable

## Toolbar

Compact single-row layout (no Card/FormField wrappers):

```
[Date picker] [□ No dates] [□ Completed]    [✓ Include sub-projects ● P1 ● F1 ● F2 ● F3 ● F4 ⚙] [Ctrl+scroll to zoom]
```

- Left: date range picker + filter checkboxes
- Right: subproject filter with legend + settings gear + undo button + zoom hint

## File Map

| File | Location | Role |
|------|----------|------|
| GanttChart.vue | `components/gantt/` | Main chart, drag handling, bubble, date tooltip, zoom |
| GanttDependencyArrows.vue | `components/gantt/` | SVG arrow rendering |
| GanttArrowSettings.vue | `components/gantt/` | Settings panel UI |
| GanttRowBars.vue | `components/gantt/` | Bar rendering, tooltips |
| GanttTimelineHeader.vue | `components/gantt/` | Month/day header |
| GanttVerticalGridLines.vue | `components/gantt/` | Grid lines |
| ProjectGantt.vue | `components/project/views/` | Gantt page, toolbar, preferences init |
| useGanttArrowConfig.ts | `composables/` | Arrow config singleton |
| useGanttBar.ts | `composables/` | Bar position calculations |
| useSubprojectColors.ts | `composables/` | Color assignment |
| useGanttFilters.ts | `views/project/helpers/` | Filter composable, cascade wiring |
| useGanttTaskList.ts | `views/project/helpers/` | Task list, cascade logic, chain walking, undo |
| SubprojectFilter.vue | `components/project/partials/` | Subproject toggle + legend |
