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
	cascadePreviews?: Array<{taskIds: Set<number>, deltaDays: number, direction: string, accentColor?: string}>
}>(), {
	subprojectColorMap: () => new Map(),
	cascadePreviews: () => [],
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
watch(
	() => props.cascadePreviews,
	(previews) => {
		const container = ganttContainer.value as HTMLElement | null
		if (!container) return

		// Clean up all previous ghosts and pulses
		container.querySelectorAll('.cascade-ghost').forEach(el => el.remove())
		container.querySelectorAll('.cascade-pulse').forEach(el => {
			el.classList.remove('cascade-pulse')
			el.removeAttribute('data-cascade-color')
		})

		if (!previews || previews.length === 0) return

		requestAnimationFrame(() => {
			for (const preview of previews) {
				const {taskIds, deltaDays, accentColor} = preview
				const deltaPixels = deltaDays * DAY_WIDTH_PIXELS.value
				const strokeColor = accentColor || '#ffffff'

				for (const taskId of taskIds) {
					const barRect = container.querySelector(`[data-task-id="${taskId}"]`) as SVGRectElement | null
					if (!barRect) continue

					// Pulse the original bar with accent color glow
					barRect.classList.add('cascade-pulse')
					if (accentColor) {
						barRect.style.setProperty('--cascade-glow', accentColor)
					}

					// Create ghost rect in the same SVG
					const svg = barRect.closest('svg')
					if (!svg) continue

					const ghost = barRect.cloneNode(true) as SVGRectElement
					ghost.classList.add('cascade-ghost')
					ghost.classList.remove('cascade-pulse')
					ghost.removeAttribute('data-task-id')
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

	// Only preventDefault immediately for mouse — touch needs native scroll to work
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
		// Touch: require a long-press hold before drag activates
		let holdConfirmed = false
		let cancelled = false
		const pointerId = event.pointerId

		const holdTimer = setTimeout(() => {
			if (!cancelled) {
				holdConfirmed = true
				// Capture pointer to prevent browser scroll takeover
				try {
					(event.target as Element)?.setPointerCapture(pointerId)
				} catch {}
				// Disable touch scrolling on the container while dragging
				const containerEl = ganttContainer.value as HTMLElement | null
				if (containerEl) {
					containerEl.style.touchAction = 'none'
				}
				// Provide haptic-like feedback via class
				const barEl = (event.target as Element)?.closest('g')
				barEl?.classList.add('gantt-bar-held')
			}
		}, TOUCH_HOLD_MS)

		const handleMove = (e: PointerEvent) => {
			if (holdConfirmed) {
				// Prevent scrolling once hold is confirmed
				e.preventDefault()
			}

			const diffX = Math.abs(e.clientX - startX)
			const diffY = Math.abs(e.clientY - startY)

			if (!holdConfirmed) {
				// Finger moved before hold timer — cancel, let browser scroll
				if (diffX > threshold || diffY > threshold) {
					cancelled = true
					clearTimeout(holdTimer)
					cleanup()
				}
				return
			}

			// Hold confirmed — now check drag threshold from hold point
			if (!dragStarted && (diffX > threshold || diffY > threshold)) {
				dragStarted = true
				cleanup()
				startDrag(bar, e)
			}
		}

		const handleStop = () => {
			cancelled = true
			clearTimeout(holdTimer)
			// Release pointer capture
			try {
				(event.target as Element)?.releasePointerCapture(pointerId)
			} catch {}
			// Restore touch scrolling
			const containerEl = ganttContainer.value as HTMLElement | null
			if (containerEl) {
				containerEl.style.touchAction = 'pan-x pan-y pinch-zoom'
			}
			cleanup()
			// Remove held visual
			const barEl = (event.target as Element)?.closest('g')
			barEl?.classList.remove('gantt-bar-held')
		}

		const cleanup = () => {
			document.removeEventListener('pointermove', handleMove)
			document.removeEventListener('pointerup', handleStop)
			document.removeEventListener('pointercancel', handleStop)
		}

		document.addEventListener('pointermove', handleMove, {passive: false})
		document.addEventListener('pointerup', handleStop)
		document.addEventListener('pointercancel', handleStop)
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
	// Now that drag is confirmed, prevent default to stop scrolling
	event.preventDefault()

	// Don't allow dragging overdue clamped bars
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
	
	const barGroup = (event.target as Element).closest('g')
	const barElement = barGroup?.querySelector('.gantt-bar')
	setCursor('grabbing', barElement)
	
	// Remove held visual if present
	barGroup?.classList.remove('gantt-bar-held')
	
	const handleMove = (e: PointerEvent) => {
		e.preventDefault() // Prevent scrolling while actively dragging
		if (!dragState.value || !isDragging.value) return
		
		const diff = e.clientX - dragState.value.startX
		const days = Math.round(diff / DAY_WIDTH_PIXELS.value)
		
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
			document.removeEventListener('pointercancel', dragStopHandler)
			dragStopHandler = null
		}
		
		clearCursor(barElement)
		
		if (dragState.value && dragState.value.currentDays !== 0) {
			const days = dragState.value.currentDays
			const absDays = Math.abs(days)
			const direction = days > 0 ? 'forward' : 'back'
			const taskName = bar.meta?.label || `Task ${bar.id}`
			const savedState = {...dragState.value}

			// Keep the bar visually at the new position while confirming
			const confirmed = window.confirm(`Move "${taskName}" ${absDays} day(s) ${direction}?`)

			if (confirmed) {
				const newStart = new Date(savedState.originalStart)
				newStart.setDate(newStart.getDate() + savedState.currentDays)
				const newEnd = new Date(savedState.originalEnd)
				newEnd.setDate(newEnd.getDate() + savedState.currentDays)
				updateGanttTask(bar.id, newStart, newEnd)
			}
			// If cancelled, bar snaps back when dragState clears
		}
		
		isDragging.value = false
		dragState.value = null
	}
	
	// Store handlers for cleanup
	dragMoveHandler = handleMove
	dragStopHandler = handleStop
	
	document.addEventListener('pointermove', handleMove)
	document.addEventListener('pointerup', handleStop)
	document.addEventListener('pointercancel', handleStop)
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
</style>
