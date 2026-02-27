<template>
	<Loading
		v-if="(isLoading && !ganttBars.length) || dayjsLanguageLoading"
		class="gantt-container"
	/>
	<div
		v-else
		ref="ganttContainer"
		class="gantt-container"
		role="application"
		:aria-label="$t('project.gantt.chartLabel')"
	>
		<div class="gantt-chart-wrapper">
			<GanttTimelineHeader
				:timeline-data="timelineData"
				:day-width-pixels="DAY_WIDTH_PIXELS"
			/>

			<GanttVerticalGridLines
				:timeline-data="timelineData"
				:total-width="totalWidth"
				:height="ganttRows.length * 40"
				:day-width-pixels="DAY_WIDTH_PIXELS"
			/>

			<GanttChartBody
				ref="ganttChartBodyRef"
				:rows="ganttRows"
				:cells-by-row="cellsByRow"
				@update:focused="handleFocusChange"
				@enterPressed="handleEnterPressed"
			>
				<template #default="{ focusedRow, focusedCell }">
					<div class="gantt-rows">
						<GanttDependencyArrows
							:bars-by-row="ganttBars"
							:tasks="tasks"
							:date-from="dateFromDate"
							:day-width-pixels="DAY_WIDTH_PIXELS"
							:total-width="totalWidth"
						/>
						<GanttRow
							v-for="(rowId, index) in ganttRows"
							:id="rowId"
							:key="rowId"
							:index="index"
						>
							<div class="gantt-row-content">
								<GanttRowBars
									:bars="ganttBars[index] ?? []"
									:total-width="totalWidth"
									:date-from-date="dateFromDate"
									:date-to-date="dateToDate"
									:day-width-pixels="DAY_WIDTH_PIXELS"
									:is-dragging="isDragging"
									:is-resizing="isResizing"
									:drag-state="dragState"
									:focused-row="focusedRow ?? null"
									:focused-cell="focusedCell"
									:row-id="rowId"
									@barPointerDown="handleBarPointerDown"
									@startResize="startResize"
									@updateTask="updateGanttTask"
								/>
							</div>
						</GanttRow>
					</div>
				</template>
			</GanttChartBody>
		</div>

		<!-- Drag confirm bubble -->
		<div
			v-if="dragConfirm && dragConfirm.phase !== 'waiting'"
			class="drag-confirm-scrim"
			@click="cancelDrag"
		/>
		<Transition name="bubble">
			<div
				v-if="dragConfirm && dragConfirm.phase !== 'waiting'"
				class="drag-confirm-bubble"
				:style="{
					left: dragConfirm.x + 'px',
					top: dragConfirm.y + 'px',
				}"
				:class="{ 'cascade-phase': dragConfirm.phase === 'cascade' }"
			>
				<!-- Move phase -->
				<template v-if="dragConfirm.phase === 'move'">
					<span class="drag-confirm-label">{{ dragConfirm.taskName }}</span>
					<span class="drag-confirm-detail">{{ dragConfirm.absDays }}d {{ dragConfirm.direction }}</span>
					<button class="drag-confirm-btn confirm" @click="confirmDrag" title="Move task">✓</button>
					<button class="drag-confirm-btn cancel" @click="cancelDrag" title="Cancel">✕</button>
				</template>
				<!-- Cascade phase -->
				<template v-else-if="dragConfirm.phase === 'cascade'">
					<span class="drag-confirm-cascade-icon" :style="{color: dragConfirm.cascadeAccentColor || '#7e7'}">↓</span>
					<span class="drag-confirm-label">{{ dragConfirm.cascadeLabel }}</span>
					<span class="drag-confirm-detail">{{ dragConfirm.absDays }}d {{ dragConfirm.direction }}</span>
					<button class="drag-confirm-btn confirm" @click="confirmDrag" title="Shift all">✓ All</button>
					<button class="drag-confirm-btn cancel" @click="cancelDrag" title="Skip">✕</button>
				</template>
			</div>
		</Transition>
	</div>
</template>
<script setup lang="ts">
import {computed, ref, watch, toRefs, onUnmounted} from 'vue'
import {useRouter} from 'vue-router'
import dayjs from 'dayjs'
import {useDayjsLanguageSync} from '@/i18n/useDayjsLanguageSync'

import {getHexColor} from '@/models/task'
import {useProjectStore} from '@/stores/projects'

import type {ITask, ITaskPartialWithId} from '@/modelTypes/ITask'
import type {DateISO} from '@/types/DateISO'
import type {GanttFilters} from '@/views/project/helpers/useGanttFilters'
import type {GanttBarModel, GanttBarDateType} from '@/composables/useGanttBar'

import GanttChartBody from '@/components/gantt/GanttChartBody.vue'
import GanttRow from '@/components/gantt/GanttRow.vue'
import GanttRowBars from '@/components/gantt/GanttRowBars.vue'
import GanttVerticalGridLines from '@/components/gantt/GanttVerticalGridLines.vue'
import GanttTimelineHeader from '@/components/gantt/GanttTimelineHeader.vue'
import GanttDependencyArrows from '@/components/gantt/GanttDependencyArrows.vue'
import Loading from '@/components/misc/Loading.vue'

import {MILLISECONDS_A_DAY} from '@/constants/date'
import {roundToNaturalDayBoundary} from '@/helpers/time/roundToNaturalDayBoundary'

const props = withDefaults(defineProps<{
	isLoading: boolean,
	filters: GanttFilters,
	tasks: Map<ITask['id'], ITask>,
	defaultTaskStartDate: DateISO
	defaultTaskEndDate: DateISO
	subprojectColorMap?: Map<number, string>
	cascadePreviews?: Array<{id: string, taskIds: Set<number>, deltaDays: number, direction: string, accentColor?: string}>
	onCascadePrompt?: Ref<((info: any) => void) | null>
}>(), {
	subprojectColorMap: () => new Map(),
	cascadePreviews: () => [],
	onCascadePrompt: undefined,
})

const emit = defineEmits<{
  (e: 'update:task', task: ITaskPartialWithId): void
}>()

const MIN_DAY_WIDTH = 10
const MAX_DAY_WIDTH = 80
const DEFAULT_DAY_WIDTH = 30
const dayWidthPixels = ref(DEFAULT_DAY_WIDTH)
// Keep a computed alias for the template (and legacy references)
const DAY_WIDTH_PIXELS = computed(() => dayWidthPixels.value)

const {tasks, filters} = toRefs(props)

const dayjsLanguageLoading = useDayjsLanguageSync(dayjs)
const projectStore = useProjectStore()
const ganttContainer = ref(null)
const ganttChartBodyRef = ref<InstanceType<typeof GanttChartBody> | null>(null)
const router = useRouter()

const isDragging = ref(false)
const isResizing = ref(false)

const currentFocusedRow = ref<string | null>(null)
const currentFocusedCell = ref<number | null>(null)

const dragState = ref<{
	barId: string
	startX: number
	originalStart: Date
	originalEnd: Date
	currentDays: number
	edge?: 'start' | 'end'
} | null>(null)

let dragMoveHandler: ((e: PointerEvent) => void) | null = null
let dragStopHandler: (() => void) | null = null

// Drag confirm bubble — handles move confirm and cascade prompts
const dragConfirm = ref<{
	barId: string
	taskName: string
	days: number
	absDays: number
	direction: string
	// Positioned relative to gantt content (scrolls with chart)
	x: number
	y: number
	originalStart: Date
	originalEnd: Date
	currentDays: number
	// Phase: 'move' = confirm drag, 'waiting' = move applied waiting for cascade, 'cascade' = confirm cascade
	phase: 'move' | 'waiting' | 'cascade'
	// Cascade info (populated after move confirmed)
	cascadeLabel?: string
	cascadeNames?: string
	cascadeAction?: () => void
	cascadeAccentColor?: string
} | null>(null)

let cascadeWaitTimer: ReturnType<typeof setTimeout> | null = null

function confirmDrag() {
	if (!dragConfirm.value) return

	if (dragConfirm.value.phase === 'move') {
		const {originalStart, originalEnd, currentDays, barId} = dragConfirm.value
		const newStart = new Date(originalStart)
		newStart.setDate(newStart.getDate() + currentDays)
		const newEnd = new Date(originalEnd)
		newEnd.setDate(newEnd.getDate() + currentDays)

		// Apply the move
		updateGanttTask(barId, newStart, newEnd)

		isDragging.value = false
		dragState.value = null

		// Enter waiting phase — cascade callback will transition to 'cascade'
		dragConfirm.value.phase = 'waiting'

		// If no cascade arrives within 1.5s, close the bubble
		if (cascadeWaitTimer) clearTimeout(cascadeWaitTimer)
		cascadeWaitTimer = setTimeout(() => {
			if (dragConfirm.value?.phase === 'waiting') {
				dragConfirm.value = null
			}
			cascadeWaitTimer = null
		}, 1500)
	} else if (dragConfirm.value.phase === 'cascade') {
		if (dragConfirm.value.cascadeAction) {
			dragConfirm.value.cascadeAction()
		}
		dragConfirm.value = null
	}
}

function cancelDrag() {
	if (cascadeWaitTimer) { clearTimeout(cascadeWaitTimer); cascadeWaitTimer = null }
	if (dragConfirm.value?.phase === 'cascade' || dragConfirm.value?.phase === 'waiting') {
		// Dismiss cascade or waiting — move already applied
		dragConfirm.value = null
	} else {
		// Cancel move — snap bar back
		dragConfirm.value = null
		isDragging.value = false
		dragState.value = null
	}
}

// Wire cascade prompt callback — transitions the drag bubble to cascade phase
if (props.onCascadePrompt) {
	props.onCascadePrompt.value = (info) => {
		// Cancel the waiting timeout since cascade arrived
		if (cascadeWaitTimer) { clearTimeout(cascadeWaitTimer); cascadeWaitTimer = null }

		if (dragConfirm.value && (dragConfirm.value.phase === 'waiting' || dragConfirm.value.phase === 'move')) {
			// Transition existing bubble to cascade phase
			dragConfirm.value = {
				...dragConfirm.value,
				phase: 'cascade',
				cascadeLabel: info.label,
				cascadeNames: info.names,
				absDays: info.absDays,
				direction: info.direction,
				cascadeAccentColor: info.accentColor,
				cascadeAction: () => {
					info.action()
					dragConfirm.value = null
				},
			}
		} else {
			// No bubble open — create one near the bar that was moved
			// Find the bar element to anchor the bubble
			const containerEl = ganttContainer.value as HTMLElement | null
			const barEl = containerEl?.querySelector(`[data-task-id="${info.previewId?.split('-')[1] || ''}"]`) as SVGRectElement | null
			let x = (containerEl?.scrollLeft || 0) + 200
			let y = (containerEl?.scrollTop || 0) + 100

			if (barEl) {
				const rect = barEl.getBoundingClientRect()
				const containerRect = containerEl?.getBoundingClientRect() || {left: 0, top: 0}
				x = rect.left - containerRect.left + (containerEl?.scrollLeft || 0) + rect.width / 2
				y = rect.top - containerRect.top + (containerEl?.scrollTop || 0) - 8
			}

			dragConfirm.value = {
				barId: '',
				taskName: info.names,
				days: 0,
				absDays: info.absDays,
				direction: info.direction,
				x,
				y,
				originalStart: new Date(),
				originalEnd: new Date(),
				currentDays: 0,
				phase: 'cascade',
				cascadeLabel: info.label,
				cascadeNames: info.names,
				cascadeAccentColor: info.accentColor,
				cascadeAction: () => {
					info.action()
					dragConfirm.value = null
				},
			}
		}
	}
}

const dateFromDate = computed(() => dayjs(filters.value.dateFrom).startOf('day').toDate())
const dateToDate = computed(() => dayjs(filters.value.dateTo).endOf('day').toDate())

const totalWidth = computed(() => {
	const dateDiff = Math.ceil((dateToDate.value.valueOf() - dateFromDate.value.valueOf()) / MILLISECONDS_A_DAY)
	return dateDiff * DAY_WIDTH_PIXELS.value
})

const timelineData = computed(() => {
	const dates: Date[] = []
	const currentDate = new Date(dateFromDate.value)
	
	while (currentDate <= dateToDate.value) {
		dates.push(new Date(currentDate))
		currentDate.setDate(currentDate.getDate() + 1)
	}
	
	return dates
})

const ganttBars = ref<GanttBarModel[][]>([])
const ganttRows = ref<string[]>([])
const cellsByRow = ref<Record<string, string[]>>({})

function getRoundedDate(value: string | Date | undefined, fallback: Date | string, isStart: boolean) {
	return roundToNaturalDayBoundary(value ? new Date(value) : new Date(fallback), isStart)
}

function transformTaskToGanttBar(t: ITask): GanttBarModel {
	const DEFAULT_SPAN_DAYS = 7

	// Determine the effective start and end dates
	// If only dueDate is set (no startDate or endDate), treat dueDate as endDate
	const effectiveEndDate = t.endDate || t.dueDate
	const effectiveStartDate = t.startDate

	let startDate: Date
	let endDate: Date
	let dateType: GanttBarDateType

	if (effectiveStartDate && effectiveEndDate) {
		// Both dates available
		startDate = getRoundedDate(effectiveStartDate, effectiveStartDate, true)
		endDate = getRoundedDate(effectiveEndDate, effectiveEndDate, false)
		dateType = 'both'
	} else if (effectiveStartDate && !effectiveEndDate) {
		// Only start date — extend forward by DEFAULT_SPAN_DAYS
		startDate = getRoundedDate(effectiveStartDate, effectiveStartDate, true)
		const defaultEnd = new Date(startDate)
		defaultEnd.setDate(defaultEnd.getDate() + DEFAULT_SPAN_DAYS)
		endDate = getRoundedDate(defaultEnd, defaultEnd, false)
		dateType = 'startOnly'
	} else if (!effectiveStartDate && effectiveEndDate) {
		// Only end date (or only due date) — extend backward by DEFAULT_SPAN_DAYS
		endDate = getRoundedDate(effectiveEndDate, effectiveEndDate, false)
		const defaultStart = new Date(endDate)
		defaultStart.setDate(defaultStart.getDate() - DEFAULT_SPAN_DAYS)
		startDate = getRoundedDate(defaultStart, defaultStart, true)
		dateType = 'endOnly'
	} else {
		// No dates at all — use defaults (existing behavior)
		startDate = getRoundedDate(undefined, props.defaultTaskStartDate, true)
		endDate = getRoundedDate(undefined, props.defaultTaskEndDate, false)
		dateType = 'both'
	}

	// Color cascade: task hex -> subprojectColorMap prop -> projectStore -> fallback
	const taskColor = getHexColor(t.hexColor)
	const subprojectColor = props.subprojectColorMap?.get(t.projectId) || null
	const storeColor = getHexColor(projectStore.projects[t.projectId]?.hexColor ?? '')
	const effectiveColor = taskColor || subprojectColor || storeColor || undefined

	return {
		id: String(t.id),
		start: startDate,
		end: endDate,
		meta: {
			label: t.title,
			task: t,
			color: effectiveColor,
			hasActualDates: Boolean(t.startDate && (t.endDate || t.dueDate)),
			dateType,
			isDone: t.done,
		},
	}
}

// Reactive triggers: force bar re-render when color sources become available
const projectStoreReady = computed(() => Object.keys(projectStore.projects).length)
const colorMapReady = computed(() => props.subprojectColorMap?.size ?? 0)

watch(
	[tasks, filters, colorMapReady, projectStoreReady],
	() => {
		const bars: GanttBarModel[] = []
		const rows: string[] = []
		const cells: Record<string, string[]> = {}

		const filteredTasks = Array.from(tasks.value.values()).filter(task => {
			const hasAnyDate = Boolean(task.startDate || task.endDate || task.dueDate)

			// Hide done tasks unless checkbox is on
			if (task.done && !filters.value.showDoneTasks) {
				return false
			}

			if (!filters.value.showTasksWithoutDates && !hasAnyDate) {
				return false
			}

			// Dateless tasks always visible when checkbox is on
			if (!hasAnyDate && filters.value.showTasksWithoutDates) {
				return true
			}

			// Incomplete tasks are always visible (clamped to left edge if out of range)
			if (!task.done) {
				return true
			}

			const bar = transformTaskToGanttBar(task)

			// Done tasks only visible if they overlap the current date range
			return bar.start <= dateToDate.value && bar.end >= dateFromDate.value
		})
		
		filteredTasks.forEach((t, index) => {
			const bar = transformTaskToGanttBar(t)

			// Clamp out-of-range bars to the visible left edge
			if (bar.end < dateFromDate.value) {
				bar.meta.isOverdue = true
				bar.meta.originalStart = new Date(bar.start)
				bar.meta.originalEnd = new Date(bar.end)
				bar.start = dateFromDate.value
				const oneDay = new Date(dateFromDate.value)
				oneDay.setDate(oneDay.getDate() + 1)
				bar.end = oneDay
			} else if (bar.start < dateFromDate.value) {
				bar.start = dateFromDate.value
			}

			bars.push(bar)
			
			const rowId = `row-${index}`
			rows.push(rowId)
			
			const rowCells: string[] = []
			timelineData.value.forEach((date, dayIndex) => {
				rowCells.push(`${rowId}-cell-${dayIndex}`)
			})
			cells[rowId] = rowCells
		})
		
		// Group bars by rows (one bar per row for now)
		ganttBars.value = bars.map(bar => [bar])
		ganttRows.value = rows
		cellsByRow.value = cells
		
	},
	{deep: true, immediate: true},
)

// Cascade preview: pulse affected bars and show ghost bars at shifted positions
const activePreviewIds = ref<Set<string>>(new Set())

watch(
	() => props.cascadePreviews,
	(previews) => {
		const container = ganttContainer.value as HTMLElement | null
		if (!container) return

		const currentIds = new Set((previews || []).map(p => p.id))

		// Remove ghosts and pulses for previews that are no longer active
		for (const oldId of activePreviewIds.value) {
			if (!currentIds.has(oldId)) {
				container.querySelectorAll(`[data-preview-id="${oldId}"]`).forEach(el => el.remove())
				container.querySelectorAll(`[data-pulse-id="${oldId}"]`).forEach(el => {
					el.classList.remove('cascade-pulse')
					el.removeAttribute('data-pulse-id')
					el.style.removeProperty('--cascade-glow')
				})
			}
		}

		// Add ghosts for new previews
		const idsToAdd = new Set<string>()
		for (const preview of (previews || [])) {
			if (!activePreviewIds.value.has(preview.id)) {
				idsToAdd.add(preview.id)
			}
		}

		// Update tracking immediately for removal, defer addition until rendered
		activePreviewIds.value = currentIds

		if (idsToAdd.size > 0) {
			requestAnimationFrame(() => {
				for (const preview of (previews || [])) {
					if (!idsToAdd.has(preview.id)) continue

					const {id, taskIds, deltaDays, accentColor} = preview
					const deltaPixels = deltaDays * DAY_WIDTH_PIXELS.value
					const strokeColor = accentColor || '#ffffff'

					for (const taskId of taskIds) {
						const barRect = container.querySelector(`[data-task-id="${taskId}"]`) as SVGRectElement | null
						if (!barRect) continue

						// Pulse the original bar
						barRect.classList.add('cascade-pulse')
						barRect.setAttribute('data-pulse-id', id)
						if (accentColor) {
							barRect.style.setProperty('--cascade-glow', accentColor)
						}

						// Create ghost rect
						const svg = barRect.closest('svg')
						if (!svg) continue

						const ghost = barRect.cloneNode(true) as SVGRectElement
						ghost.classList.add('cascade-ghost')
						ghost.classList.remove('cascade-pulse')
						ghost.removeAttribute('data-task-id')
						ghost.removeAttribute('data-pulse-id')
						ghost.setAttribute('data-preview-id', id)
						ghost.style.pointerEvents = 'none'

						const currentX = parseFloat(ghost.getAttribute('x') || '0')
						ghost.setAttribute('x', String(currentX + deltaPixels))
						ghost.setAttribute('opacity', '0.3')
						ghost.setAttribute('stroke', strokeColor)
						ghost.setAttribute('stroke-width', '2')
						ghost.setAttribute('stroke-dasharray', '4,3')

						svg.appendChild(ghost)
					}
				}
			})
		}
	},
	{deep: true},
)

function updateGanttTask(id: string, newStart: Date, newEnd: Date) {
	const task = tasks.value.get(Number(id))
	if (!task) return

	const update: ITaskPartialWithId = {
		id: Number(id),
	}

	const hasStartDate = Boolean(task.startDate)
	const hasEndDate = Boolean(task.endDate)
	const hasDueDate = Boolean(task.dueDate)

	if (hasStartDate && hasEndDate) {
		// Both dates exist — update both
		update.startDate = roundToNaturalDayBoundary(newStart, true)
		update.endDate = roundToNaturalDayBoundary(newEnd)
	} else if (hasStartDate && !hasEndDate && hasDueDate) {
		// startDate + dueDate (no endDate) — treat as fully dated
		update.startDate = roundToNaturalDayBoundary(newStart, true)
		update.dueDate = roundToNaturalDayBoundary(newEnd)
	} else if (hasStartDate && !hasEndDate) {
		// startOnly — only update startDate, don't persist the synthetic end
		update.startDate = roundToNaturalDayBoundary(newStart, true)
	} else if (!hasStartDate && (hasEndDate || hasDueDate)) {
		// endOnly / dueOnly — only update the end side
		if (hasEndDate) {
			update.endDate = roundToNaturalDayBoundary(newEnd)
		}
		if (hasDueDate) {
			update.dueDate = roundToNaturalDayBoundary(newEnd)
		}
	} else {
		// No dates at all — update both (existing behavior for dateless tasks)
		update.startDate = roundToNaturalDayBoundary(newStart, true)
		update.endDate = roundToNaturalDayBoundary(newEnd)
	}

	emit('update:task', update)
}

function openTask(bar: GanttBarModel) {
	router.push({
		name: 'task.detail',
		params: {id: bar.id},
		state: {backdropView: router.currentRoute.value.fullPath},
	})
}

// Double-click and drag detection
let lastClickTime = 0
let dragStarted = false

const DOUBLE_CLICK_THRESHOLD_MS = 500
const DRAG_THRESHOLD_PIXELS = 5
const TOUCH_DRAG_THRESHOLD_PIXELS = 20
const TOUCH_HOLD_MS = 300

function isTouchEvent(e: PointerEvent): boolean {
	return e.pointerType === 'touch'
}

function handleBarPointerDown(bar: GanttBarModel, event: PointerEvent) {
	const isTouch = isTouchEvent(event)

	// Only preventDefault immediately for mouse — touch uses separate handler
	if (!isTouch) {
		event.preventDefault()
	}
	
	const barIndex = ganttBars.value.findIndex(barGroup => barGroup.some(b => b.id === bar.id))
	if (barIndex !== -1 && ganttRows.value[barIndex]) {
		focusTaskBar(ganttRows.value[barIndex])
	}
	
	const currentTime = Date.now()
	const timeDiff = currentTime - lastClickTime
	
	if (timeDiff < DOUBLE_CLICK_THRESHOLD_MS) {	
		openTask(bar)
		lastClickTime = 0
		return
	}
	
	lastClickTime = currentTime
	dragStarted = false
	
	const startX = event.clientX
	const startY = event.clientY
	const threshold = isTouch ? TOUCH_DRAG_THRESHOLD_PIXELS : DRAG_THRESHOLD_PIXELS

	if (isTouch) {
		// Touch drag: use native Touch events for reliable scroll prevention.
		// PointerEvents get cancelled by the browser once scrolling starts,
		// but TouchEvents with preventDefault() in a non-passive handler block scroll.
		let holdConfirmed = false
		let cancelled = false
		const targetEl = event.target as Element

		const holdTimer = setTimeout(() => {
			if (!cancelled) {
				holdConfirmed = true
				const barEl = targetEl.closest('g')
				barEl?.classList.add('gantt-bar-held')
			}
		}, TOUCH_HOLD_MS)

		const handleTouchMoveForDrag = (e: TouchEvent) => {
			const touch = e.touches[0]
			if (!touch) return

			const diffX = Math.abs(touch.clientX - startX)
			const diffY = Math.abs(touch.clientY - startY)

			if (!holdConfirmed) {
				if (diffX > threshold || diffY > threshold) {
					cancelled = true
					clearTimeout(holdTimer)
					cleanupTouch()
				}
				return
			}

			// Hold confirmed — block scrolling
			e.preventDefault()

			if (!dragStarted && (diffX > threshold || diffY > threshold)) {
				dragStarted = true
				cleanupTouch()
				// Create a synthetic PointerEvent-like object for startDrag
				startDrag(bar, {
					clientX: touch.clientX,
					clientY: touch.clientY,
					preventDefault: () => {},
					target: targetEl,
				} as unknown as PointerEvent)
			}
		}

		const handleTouchEndForDrag = () => {
			cancelled = true
			clearTimeout(holdTimer)
			cleanupTouch()
			const barEl = targetEl.closest('g')
			barEl?.classList.remove('gantt-bar-held')
		}

		const cleanupTouch = () => {
			document.removeEventListener('touchmove', handleTouchMoveForDrag)
			document.removeEventListener('touchend', handleTouchEndForDrag)
			document.removeEventListener('touchcancel', handleTouchEndForDrag)
		}

		// CRITICAL: {passive: false} allows preventDefault in touchmove
		document.addEventListener('touchmove', handleTouchMoveForDrag, {passive: false})
		document.addEventListener('touchend', handleTouchEndForDrag)
		document.addEventListener('touchcancel', handleTouchEndForDrag)
	} else {
		// Mouse: immediate drag on threshold
		const handleMove = (e: PointerEvent) => {
			const diffX = Math.abs(e.clientX - startX)
			const diffY = Math.abs(e.clientY - startY)
			
			if (!dragStarted && (diffX > threshold || diffY > threshold)) {	
				dragStarted = true
				document.removeEventListener('pointermove', handleMove)
				document.removeEventListener('pointerup', handleStop)
				startDrag(bar, e)
			}
		}
		
		const handleStop = () => {
			document.removeEventListener('pointermove', handleMove)
			document.removeEventListener('pointerup', handleStop)
		}
		
		document.addEventListener('pointermove', handleMove)
		document.addEventListener('pointerup', handleStop)
	}
}

function setCursor(cursor: string, barElement?: Element | null) {
	document.body.style.setProperty('cursor', cursor, 'important')
	if (barElement) {
		(barElement as HTMLElement).style.setProperty('cursor', cursor, 'important')
	}
}

function clearCursor(barElement?: Element | null) {
	document.body.style.removeProperty('cursor')
	if (barElement) {
		(barElement as HTMLElement).style.removeProperty('cursor')
	}
}

function startDrag(bar: GanttBarModel, event: PointerEvent) {
	event.preventDefault()

	if (bar.meta?.isOverdue) {
		openTask(bar)
		return
	}
	
	isDragging.value = true
	dragState.value = {
		barId: bar.id,
		startX: event.clientX,
		originalStart: new Date(bar.start),
		originalEnd: new Date(bar.end),
		currentDays: 0,
	}
	
	const barGroup = (event.target as Element)?.closest('g')
	const barElement = barGroup?.querySelector('.gantt-bar')
	setCursor('grabbing', barElement)
	barGroup?.classList.remove('gantt-bar-held')
	
	const isTouch = event.pointerType === 'touch' || !(event instanceof PointerEvent)

	const updateDragDays = (clientX: number) => {
		if (!dragState.value || !isDragging.value) return
		const diff = clientX - dragState.value.startX
		const days = Math.round(diff / DAY_WIDTH_PIXELS.value)
		if (days !== dragState.value.currentDays) {
			dragState.value.currentDays = days
		}
	}

	// Pointer handlers (mouse)
	const handlePointerMove = (e: PointerEvent) => {
		e.preventDefault()
		updateDragDays(e.clientX)
	}
	
	// Touch handlers (mobile)
	const handleTouchMove = (e: TouchEvent) => {
		e.preventDefault()
		if (e.touches[0]) updateDragDays(e.touches[0].clientX)
	}

	const handleStop = () => {
		// Remove all listeners
		document.removeEventListener('pointermove', handlePointerMove)
		document.removeEventListener('pointerup', handleStop)
		document.removeEventListener('pointercancel', handleStop)
		document.removeEventListener('touchmove', handleTouchMove)
		document.removeEventListener('touchend', handleStop)
		document.removeEventListener('touchcancel', handleStop)
		dragMoveHandler = null
		dragStopHandler = null
		
		clearCursor(barElement)
		
		if (dragState.value && dragState.value.currentDays !== 0) {
			const days = dragState.value.currentDays
			const absDays = Math.abs(days)
			const direction = days > 0 ? 'forward' : 'back'
			const taskName = bar.meta?.label || `Task ${bar.id}`

			// Position bubble relative to scroll content so it moves with the chart
			const barGroup = barElement?.closest('g') || barElement
			const rect = barGroup?.getBoundingClientRect() || {left: 0, top: 0, width: 0}
			const containerEl = ganttContainer.value as HTMLElement | null
			const containerRect = containerEl?.getBoundingClientRect() || {left: 0, top: 0}

			dragConfirm.value = {
				barId: bar.id,
				taskName,
				days,
				absDays,
				direction,
				x: rect.left - containerRect.left + (containerEl?.scrollLeft || 0) + rect.width / 2,
				y: rect.top - containerRect.top + (containerEl?.scrollTop || 0) - 8,
				originalStart: new Date(dragState.value.originalStart),
				originalEnd: new Date(dragState.value.originalEnd),
				currentDays: dragState.value.currentDays,
				phase: 'move',
			}

			// Keep isDragging true so bar stays at preview position
		} else {
			isDragging.value = false
			dragState.value = null
		}
	}
	
	// Store handlers for cleanup
	dragMoveHandler = handlePointerMove
	dragStopHandler = handleStop
	
	if (isTouch) {
		document.addEventListener('touchmove', handleTouchMove, {passive: false})
		document.addEventListener('touchend', handleStop)
		document.addEventListener('touchcancel', handleStop)
	} else {
		document.addEventListener('pointermove', handlePointerMove)
		document.addEventListener('pointerup', handleStop)
		document.addEventListener('pointercancel', handleStop)
	}
}

function startResize(bar: GanttBarModel, edge: 'start' | 'end', event: PointerEvent) {
	// Disable resize on touch — handles are hidden but just in case
	if (isTouchEvent(event)) return

	event.preventDefault()
	event.stopPropagation() // Prevent drag from triggering
	
	isResizing.value = true
	dragState.value = {
		barId: bar.id,
		startX: event.clientX,
		originalStart: new Date(bar.start),
		originalEnd: new Date(bar.end),
		currentDays: 0,
		edge,
	}
	
	const barGroup = (event.target as Element).closest('g')
	const barElement = barGroup?.querySelector('.gantt-bar')
	setCursor('col-resize', barElement)
	
	const handleMove = (e: PointerEvent) => {
		if (!dragState.value || !isResizing.value) return
		
		const diff = e.clientX - dragState.value.startX
		const days = Math.round(diff / DAY_WIDTH_PIXELS.value)
		
		if (edge === 'start') {
			const newStart = new Date(dragState.value.originalStart)
			newStart.setDate(newStart.getDate() + days)
			if (newStart >= dragState.value.originalEnd) return
		} else {
			const newEnd = new Date(dragState.value.originalEnd)
			newEnd.setDate(newEnd.getDate() + days)
			if (newEnd <= dragState.value.originalStart) return
		}
		
		if (days !== dragState.value.currentDays) {
			dragState.value.currentDays = days
		}
	}
	
	const handleStop = () => {
		if (dragMoveHandler) {
			document.removeEventListener('pointermove', dragMoveHandler)
			dragMoveHandler = null
		}
		if (dragStopHandler) {
			document.removeEventListener('pointerup', dragStopHandler)
			dragStopHandler = null
		}
		
		clearCursor(barElement)
		
		if (dragState.value && dragState.value.currentDays !== 0) {
			if (edge === 'start') {
				const newStart = new Date(dragState.value.originalStart)
				newStart.setDate(newStart.getDate() + dragState.value.currentDays)
				
				// Ensure start doesn't go past end
				if (newStart < dragState.value.originalEnd) {
					updateGanttTask(bar.id, newStart, dragState.value.originalEnd)
				}
			} else {
				const newEnd = new Date(dragState.value.originalEnd)
				newEnd.setDate(newEnd.getDate() + dragState.value.currentDays)
				
				// Ensure end doesn't go before start
				if (newEnd > dragState.value.originalStart) {
					updateGanttTask(bar.id, dragState.value.originalStart, newEnd)
				}
			}
		}
		
		isResizing.value = false
		dragState.value = null
	}
	
	// Store handlers for cleanup
	dragMoveHandler = handleMove
	dragStopHandler = handleStop
	
	document.addEventListener('pointermove', handleMove)
	document.addEventListener('pointerup', handleStop)
}

function handleFocusChange(payload: { row: string | null; cell: number | null }) {
	currentFocusedRow.value = payload.row
	currentFocusedCell.value = payload.cell
}

function handleEnterPressed(payload: { row: string; cell: number }) {
	const rowIndex = ganttRows.value.indexOf(payload.row)
	if (rowIndex !== -1 && ganttBars.value[rowIndex]?.[0]) {
		const bar = ganttBars.value[rowIndex][0]
		openTask(bar)
	}
}

function focusTaskBar(rowId: string) {
	setTimeout(() => {
		const taskBarElement = document.querySelector(`[data-row-id="${rowId}"] [role="slider"]`) as HTMLElement
		if (taskBarElement) {
			taskBarElement.focus()
		}
	}, 0)
}

// Suppress native context menu on touch devices (conflicts with long-press-to-drag)
let lastPointerType = ''
function trackPointerType(e: PointerEvent) {
	lastPointerType = e.pointerType
}
function suppressTouchContextMenu(e: MouseEvent) {
	if (lastPointerType === 'touch') {
		e.preventDefault()
	}
}

const container = ganttContainer as unknown as {value: HTMLElement | null}
watch(ganttContainer, (el) => {
	if (el) {
		(el as HTMLElement).addEventListener('pointerdown', trackPointerType, {passive: true})
		;(el as HTMLElement).addEventListener('contextmenu', suppressTouchContextMenu)
	}
}, {immediate: true})

onUnmounted(() => {
	if (container.value) {
		container.value.removeEventListener('pointerdown', trackPointerType)
		container.value.removeEventListener('contextmenu', suppressTouchContextMenu)
		container.value.removeEventListener('touchstart', handleTouchStart as EventListener)
		container.value.removeEventListener('touchmove', handleTouchMove as EventListener)
	}
	if (dragMoveHandler) {
		document.removeEventListener('pointermove', dragMoveHandler)
		dragMoveHandler = null
	}
	if (dragStopHandler) {
		document.removeEventListener('pointerup', dragStopHandler)
		dragStopHandler = null
	}
	document.body.style.removeProperty('cursor')
})

// Pinch-to-zoom on touch devices
let pinchStartDistance = 0
let pinchStartWidth = DEFAULT_DAY_WIDTH

function getTouchDistance(e: TouchEvent): number {
	const t1 = e.touches[0]
	const t2 = e.touches[1]
	return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
}

function handleTouchStart(e: TouchEvent) {
	if (e.touches.length === 2) {
		e.preventDefault()
		pinchStartDistance = getTouchDistance(e)
		pinchStartWidth = dayWidthPixels.value
	}
}

function handleTouchMove(e: TouchEvent) {
	if (e.touches.length === 2) {
		e.preventDefault()
		const currentDistance = getTouchDistance(e)
		const scale = currentDistance / pinchStartDistance
		const newWidth = Math.round(pinchStartWidth * scale)
		dayWidthPixels.value = Math.max(MIN_DAY_WIDTH, Math.min(MAX_DAY_WIDTH, newWidth))
	}
}

watch(ganttContainer, (el) => {
	if (el) {
		(el as HTMLElement).addEventListener('touchstart', handleTouchStart, {passive: false})
		;(el as HTMLElement).addEventListener('touchmove', handleTouchMove, {passive: false})
	}
}, {immediate: true})
</script>

<style scoped lang="scss">
.gantt-container {
	overflow-x: auto;
	-webkit-touch-callout: none;
	-webkit-user-select: none;
	user-select: none;
	touch-action: pan-x pan-y pinch-zoom;
}

// Visual feedback when touch-hold is confirmed
:deep(.gantt-bar-held .gantt-bar) {
	filter: brightness(1.2);
	outline: 2px solid var(--primary);
	outline-offset: 1px;
}

.gantt-chart-wrapper {
	inline-size: max-content;
	min-inline-size: 100%;
	position: relative;
}

.gantt-rows {
	position: relative;
	z-index: 2;
}

.gantt-row-content {
	position: relative;
	min-block-size: 40px;
	inline-size: 100%;
}

:deep(.cascade-pulse) {
	--cascade-glow: rgba(240, 173, 78, 0.6);
	animation: bar-cascade-pulse 1s ease-in-out infinite;
}

@keyframes bar-cascade-pulse {
	0%, 100% {
		filter: brightness(1) drop-shadow(0 0 0 transparent);
	}
	50% {
		filter: brightness(1.3) drop-shadow(0 0 8px var(--cascade-glow, rgba(240, 173, 78, 0.6)));
	}
}

:deep(.cascade-ghost) {
	animation: ghost-float 1.5s ease-in-out infinite;
}

@keyframes ghost-float {
	0%, 100% {
		opacity: 0.2;
	}
	50% {
		opacity: 0.35;
	}
}

// Drag confirm bubble
.drag-confirm-scrim {
	position: fixed;
	inset: 0;
	background: rgba(0, 0, 0, 0.15);
	z-index: 90;
	cursor: pointer;
}

.drag-confirm-bubble {
	position: absolute;
	z-index: 100;
	transform: translate(-50%, -100%);
	background: var(--grey-900, #1a1a2e);
	border: 1px solid var(--grey-700, #444);
	border-radius: 10px;
	padding: 4px 8px;
	display: flex;
	align-items: center;
	gap: 6px;
	box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
	white-space: nowrap;
	pointer-events: auto;

	&.cascade-phase {
		border-color: var(--cascade-accent, #7e7);
	}

	&::after {
		content: '';
		position: absolute;
		bottom: -6px;
		left: 50%;
		transform: translateX(-50%);
		width: 0;
		height: 0;
		border-left: 6px solid transparent;
		border-right: 6px solid transparent;
		border-top: 6px solid var(--grey-900, #1a1a2e);
	}
}

.drag-confirm-cascade-icon {
	font-size: 0.85rem;
	font-weight: bold;
	line-height: 1;
}

.drag-confirm-label {
	font-size: 0.75rem;
	font-weight: 600;
	color: var(--grey-100, #eee);
	max-width: 180px;
	overflow: hidden;
	text-overflow: ellipsis;
}

.drag-confirm-detail {
	font-size: 0.7rem;
	color: var(--grey-400, #aaa);
}

.drag-confirm-btn {
	min-width: 26px;
	height: 26px;
	border-radius: 13px;
	border: none;
	cursor: pointer;
	font-size: 0.7rem;
	font-weight: bold;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 0 8px;
	white-space: nowrap;
	transition: transform 0.1s;

	&:active {
		transform: scale(0.9);
	}
}

.drag-confirm-btn.confirm {
	background: #4caf50;
	color: white;
}

.drag-confirm-btn.cancel {
	background: #666;
	color: white;
}

.drag-confirm-btn.confirm:hover {
	background: #66bb6a;
}

.drag-confirm-btn.cancel:hover {
	background: #888;
}

// Bubble transition
.bubble-enter-active {
	transition: opacity 0.15s, transform 0.15s;
}
.bubble-leave-active {
	transition: opacity 0.1s, transform 0.1s;
}
.bubble-enter-from {
	opacity: 0;
	transform: translate(-50%, -90%) scale(0.8);
}
.bubble-leave-to {
	opacity: 0;
	transform: translate(-50%, -100%) scale(0.9);
}
</style>
