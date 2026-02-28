import {computed, ref, type Ref, shallowReactive, watch, type ComputedRef} from 'vue'
import {klona} from 'klona/lite'

import type {Filters} from '@/composables/useRouteFilters'
import type {ITask, ITaskPartialWithId} from '@/modelTypes/ITask'

import TaskCollectionService, {type TaskFilterParams} from '@/services/taskCollection'
import TaskService from '@/services/task'

import TaskModel from '@/models/task'
import {error, success, warning} from '@/message'
import {useAuthStore} from '@/stores/auth'
import {useTaskStore} from '@/stores/tasks'
import type {IProjectView} from '@/modelTypes/IProjectView'
import {useUserPreferences} from '@/composables/useUserPreferences'

// Cascade prompt style: 'toast' = sticky pulse toast, 'modal' = confirm dialog overlay
function getCascadePromptStyle(): 'toast' | 'modal' {
	const prefs = useUserPreferences()
	const style = prefs.get('gantt-cascade-prompt-style', 'toast')
	if (style === 'modal' || style === 'toast') return style
	return 'toast'
}

// Cascade mode: 'bulk' = shift all at once, 'individual' = confirm each
function getCascadeMode(): 'bulk' | 'individual' {
	const prefs = useUserPreferences()
	const mode = prefs.get('gantt-cascade-mode', 'bulk')
	if (mode === 'bulk' || mode === 'individual') return mode
	return 'bulk'
}
export interface CascadePreview {
	id: string
	taskIds: Set<number>
	deltaDays: number
	direction: 'precedes' | 'follows'
	accentColor?: string
}

export interface UseGanttTaskListReturn {
	tasks: Ref<Map<ITask['id'], ITask>>
	isLoading: ComputedRef<boolean>
	loadTasks: () => Promise<void>
	addTask: (task: Partial<ITask>) => Promise<ITask>
	updateTask: (task: ITaskPartialWithId) => Promise<void>
	canUndo: ComputedRef<boolean>
	undoLastAction: () => Promise<void>
	cascadePreviews: Ref<CascadePreview[]>
	onCascadePrompt: Ref<((info: {label: string, names: string, absDays: number, direction: string, accentColor: string, action: () => void, skip?: () => void, dismiss?: () => void, barId?: string, stepIndex?: number, stepTotal?: number}) => void) | null>
	onCascadeClose: Ref<(() => void) | null>
}

// FIXME: unify with general `useTaskList`
export function useGanttTaskList<F extends Filters>(
	filters: Ref<F>,
	filterToApiParams: (filters: F) => TaskFilterParams,
	viewId: Ref<IProjectView['id']>,
	loadAll: boolean = true,
	extraParams?: Ref<Record<string, unknown>>,
) : UseGanttTaskListReturn {
	const taskCollectionService = shallowReactive(new TaskCollectionService())
	const taskService = shallowReactive(new TaskService())
	const authStore = useAuthStore()

	const isLoading = computed(() => taskCollectionService.loading)

	const tasks = ref<Map<ITask['id'], ITask>>(new Map())

	// Undo stack: stores snapshots of task states before changes
	interface UndoEntry {
		snapshots: Map<ITask['id'], ITask>  // original task states before the action
		timestamp: number
	}
	const undoStack = ref<UndoEntry | null>(null)
	const canUndo = computed(() => undoStack.value !== null)
	let undoTimer: ReturnType<typeof setTimeout> | null = null
	const UNDO_TIMEOUT_MS = 7500

	function pushUndoSnapshot(taskIds: ITask['id'][]) {
		const snapshots = new Map<ITask['id'], ITask>()
		for (const id of taskIds) {
			const t = tasks.value.get(id)
			if (t) snapshots.set(id, klona(t))
		}
		undoStack.value = {snapshots, timestamp: Date.now()}

		// Auto-expire after timeout
		if (undoTimer) clearTimeout(undoTimer)
		undoTimer = setTimeout(() => {
			undoStack.value = null
		}, UNDO_TIMEOUT_MS)
	}

	async function undoLastAction() {
		if (!undoStack.value) return

		const {snapshots} = undoStack.value
		undoStack.value = null
		if (undoTimer) {
			clearTimeout(undoTimer)
			undoTimer = null
		}

		for (const [id, originalTask] of snapshots) {
			try {
				const restored = await taskService.update(originalTask)
				tasks.value.set(restored.id, restored)
			} catch (e) {
				console.error(`Failed to undo task ${id}:`, e)
			}
		}
		success({message: 'Undone'})
	}

	const cascadePreviews = ref<CascadePreview[]>([])

	let cascadeIdCounter = 0
	const onCascadePrompt = ref<((info: {label: string, names: string, absDays: number, direction: string, accentColor: string, action: () => void, skip?: () => void, dismiss?: () => void, barId?: string, stepIndex?: number, stepTotal?: number}) => void) | null>(null)
	const onCascadeClose = ref<(() => void) | null>(null)

	function clearCascadePreview(previewId?: string) {
		if (previewId) {
			cascadePreviews.value = cascadePreviews.value.filter(p => p.id !== previewId)
		} else {
			cascadePreviews.value = []
		}
	}

	async function collectChainTaskIds(startTasks: ITask[], direction: 'precedes' | 'follows'): Promise<Set<number>> {
		const ids = new Set<number>()
		for (const t of startTasks) {
			ids.add(t.id)
			try {
				const full = await taskService.get(new TaskModel({id: t.id}))
				const next = full?.relatedTasks?.[direction]
				if (next && Array.isArray(next) && next.length > 0) {
					const childIds = await collectChainTaskIds(next, direction)
					childIds.forEach(id => ids.add(id))
				}
			} catch {}
		}
		return ids
	}

	async function fetchTasks(params: TaskFilterParams, page = 1): Promise<ITask[]> {

		if (params.filter_timezone === '') {
			params.filter_timezone = authStore.settings.timezone
		}

		// Merge any extra params (e.g. include_subprojects, exclude_project_ids)
		const mergedParams = extraParams?.value
			? {...params, ...extraParams.value}
			: params
		
		const tasks = await taskCollectionService.getAll({projectId: filters.value.projectId, viewId: viewId.value}, mergedParams, page) as ITask[]
		if (loadAll && page < taskCollectionService.totalPages) {
			const nextTasks = await fetchTasks(params, page + 1)
			return tasks.concat(nextTasks)
		}
		return tasks
	}

	/**
	 * Load and assign new tasks
	 * Normally there is no need to trigger this manually
	 */
	async function loadTasks() {
		const params: TaskFilterParams = filterToApiParams(filters.value)

		const loadedTasks = await fetchTasks(params)
		tasks.value = new Map()
		loadedTasks.forEach(t => tasks.value.set(t.id, t))
	}

	/**
	 * Load tasks when filters change
	 */
	watch(
		filters,
		() => loadTasks(),
		{immediate: true, deep: true},
	)

	// Sync task updates from other views (e.g. task detail modal)
	const taskStore = useTaskStore()
	watch(
		() => taskStore.lastUpdatedTask,
		(updatedTask) => {
			if (updatedTask && tasks.value.has(updatedTask.id)) {
				tasks.value.set(updatedTask.id, updatedTask)
			}
		},
	)

	async function addTask(task: Partial<ITask>) {
		const newTask = await taskService.create(new TaskModel({...task}))
		tasks.value.set(newTask.id, newTask)

		return newTask
	}

	async function updateTask(task: ITaskPartialWithId) {
		const oldTask = klona(tasks.value.get(task.id))

		if (!oldTask) return

		// Capture pre-change snapshot for undo (just this task for now; cascade adds more)
		pushUndoSnapshot([task.id])

		// we extend the task with potentially missing info
		const newTask: ITask = {
			...oldTask,
			...task,
		}

		// set in expectation that server update works
		tasks.value.set(newTask.id, newTask)

		try {
			const updatedTask = await taskService.update(newTask)
			// update the task with possible changes from server
			tasks.value.set(updatedTask.id, updatedTask)
			success({message: 'Saved'}, [{title: 'Undo', callback: undoLastAction}])

			// Check for date cascade: if start or end date changed, check for downstream chain tasks
			const startChanged = oldTask.startDate?.toString() !== newTask.startDate?.toString()
			const endChanged = oldTask.endDate?.toString() !== newTask.endDate?.toString()

			if (startChanged || endChanged) {
				await checkCascadeDownstream(updatedTask, oldTask)
			}
		} catch (_) {
			error('Something went wrong saving the task')
			// roll back changes
			tasks.value.set(task.id, oldTask)
			undoStack.value = null
		}
	}

	async function checkCascadeDownstream(updatedTask: ITask, oldTask: ITask) {
		try {
			const fullTask = await taskService.get(new TaskModel({id: updatedTask.id}))
			// "precedes" = tasks that come AFTER this one (downstream successors)
			const successors = fullTask?.relatedTasks?.precedes
			// "follows" = tasks that come BEFORE this one (upstream predecessors)
			const predecessors = fullTask?.relatedTasks?.follows

			const hasSuccessors = successors && Array.isArray(successors) && successors.length > 0
			const hasPredecessors = predecessors && Array.isArray(predecessors) && predecessors.length > 0

			if (!hasSuccessors && !hasPredecessors) return

			const oldStart = oldTask.startDate ? new Date(oldTask.startDate).getTime() : 0
			const newStart = updatedTask.startDate ? new Date(updatedTask.startDate).getTime() : 0
			if (oldStart === 0 || newStart === 0) return

			const deltaDays = Math.round((newStart - oldStart) / (1000 * 60 * 60 * 24))
			if (deltaDays === 0) return

			const absDays = Math.abs(deltaDays)
			const movedEarlier = deltaDays < 0
			const today = new Date()
			today.setHours(0, 0, 0, 0)

			const promptStyle = getCascadePromptStyle()

			// Helper: get a representative color for a task group
			function getTaskColor(taskList: ITask[]): string | undefined {
				for (const t of taskList) {
					if (t.hexColor) return t.hexColor
				}
				return undefined
			}

			// Helper: get task names for display
			function getTaskNames(taskList: ITask[], max = 2): string {
				const names = taskList.slice(0, max).map(t => t.title)
				if (taskList.length > max) names.push(`+${taskList.length - max} more`)
				return names.join(', ')
			}

			// Upstream: if moved earlier and now overlaps/precedes a predecessor, offer to shift them
			if (movedEarlier && hasPredecessors) {
				const collides = predecessors!.some(p => p.startDate && new Date(newStart) <= new Date(p.startDate))
				if (collides) {
					const earliest = findEarliestDate(predecessors!)
					if (earliest) {
						const shifted = new Date(earliest.getTime() + deltaDays * 24 * 60 * 60 * 1000)
						if (shifted < today) {
							warning(`Shifting predecessors will move tasks to ${shifted.toLocaleDateString()}, which is in the past.`)
						}
					}

					const predColor = getTaskColor(predecessors!) || '#e77'
					const predNames = getTaskNames(predecessors!)

					// Show preview of affected tasks
					const previewIds = await collectChainTaskIds(predecessors!, 'follows')
					const predPreviewId = `cascade-${++cascadeIdCounter}`
					cascadePreviews.value.push({id: predPreviewId, taskIds: previewIds, deltaDays, direction: 'follows', accentColor: predColor})

					if (promptStyle === 'modal') {
						const confirmed = window.confirm(`Overlaps predecessor(s): ${predNames}. Shift ${absDays} day(s) back?`)
						clearCascadePreview(predPreviewId)
						if (confirmed) {
							await cascadeShiftChain(predecessors!, deltaDays, 'follows')
							await loadTasks()
						}
					} else if (onCascadePrompt.value) {
						onCascadePrompt.value({
							label: `↑ Predecessors`,
							names: predNames,
							absDays,
							direction: 'back',
							accentColor: predColor,
							action: async () => { await cascadeShiftChain(predecessors!, deltaDays, 'follows'); clearCascadePreview(predPreviewId); await loadTasks() },
							dismiss: () => { clearCascadePreview(predPreviewId) },
							barId: String(predecessors![0]?.id || ''),
						})
					} else {
						warning(`Overlaps: ${predNames}`, [{
							title: `Shift ${absDays}d back`,
							callback: async () => { await cascadeShiftChain(predecessors!, deltaDays, 'follows'); clearCascadePreview(predPreviewId); await loadTasks() },
						}, {
							title: 'Dismiss',
							callback: () => clearCascadePreview(predPreviewId),
						}], {accentColor: predColor, label: `↑ Predecessors`})
					}
				}
			}

			// Downstream: always offer to shift successors
			if (hasSuccessors) {
				if (movedEarlier) {
					const earliest = findEarliestDate(successors!)
					if (earliest) {
						const shifted = new Date(earliest.getTime() + deltaDays * 24 * 60 * 60 * 1000)
						if (shifted < today) {
							warning(`Shifting downstream will move tasks to ${shifted.toLocaleDateString()}, which is in the past.`)
						}
					}
				}
				const direction = deltaDays > 0 ? 'forward' : 'back'
				const succColor = getTaskColor(successors!) || '#7e7'
				const succNames = getTaskNames(successors!)

				// Show preview of affected tasks
				const previewIds = await collectChainTaskIds(successors!, 'precedes')
				const succPreviewId = `cascade-${++cascadeIdCounter}`
				cascadePreviews.value.push({id: succPreviewId, taskIds: previewIds, deltaDays, direction: 'precedes', accentColor: succColor})

				const cascadeMode = getCascadeMode()

				if (promptStyle === 'modal') {
					const confirmed = window.confirm(`Shift downstream: ${succNames} — ${absDays} day(s) ${direction}?`)
					clearCascadePreview(succPreviewId)
					if (confirmed) {
						await cascadeShiftChain(successors!, deltaDays, 'precedes')
						await loadTasks() // Refetch so arrows redraw with updated positions
					}
				} else if (cascadeMode === 'individual' && onCascadePrompt.value) {
					// Individual mode: step through each successor one at a time
					await cascadeStepThrough(successors!, deltaDays, 'precedes', absDays, direction, succColor, succPreviewId)
				} else if (onCascadePrompt.value) {
					onCascadePrompt.value({
						label: `↓ ${successors!.length} Downstream`,
						names: succNames,
						absDays,
						direction,
						accentColor: succColor,
						action: async () => { await cascadeShiftChain(successors!, deltaDays, 'precedes'); clearCascadePreview(succPreviewId); await loadTasks() },
						dismiss: () => { clearCascadePreview(succPreviewId) },
						barId: String(successors![0]?.id || ''),
					})
				} else {
					warning(`${succNames}`, [{
						title: `Shift ${absDays}d ${direction}`,
						callback: async () => { await cascadeShiftChain(successors!, deltaDays, 'precedes'); clearCascadePreview(succPreviewId); await loadTasks() },
					}, {
						title: 'Dismiss',
						callback: () => clearCascadePreview(succPreviewId),
					}], {accentColor: succColor, label: `↓ ${successors!.length} Downstream`})
				}
			}
		} catch (e) {
			console.error('Failed to check cascade:', e)
		}
	}

	/**
	 * Individual cascade mode: step through each downstream task one at a time.
	 * Collects the full chain first, then shows the bubble anchored to each task bar in sequence.
	 * ✓ = shift this task, → = skip this task, ✕ = cancel remaining.
	 */
	async function cascadeStepThrough(
		startTasks: ITask[],
		deltaDays: number,
		direction: 'precedes' | 'follows',
		absDays: number,
		dirLabel: string,
		accentColor: string,
		previewId: string,
	) {
		const deltaMs = deltaDays * 24 * 60 * 60 * 1000
		const shiftedIds = new Set<number>()

		// Collect the full chain of tasks in order (breadth-first walk)
		const chainTasks: ITask[] = []
		const visited = new Set<number>()

		async function walkChain(taskList: ITask[]) {
			for (const t of taskList) {
				if (visited.has(t.id)) continue
				visited.add(t.id)
				chainTasks.push(t)
				try {
					const full = await taskService.get(new TaskModel({id: t.id}))
					const next = full?.relatedTasks?.[direction]
					if (next && Array.isArray(next) && next.length > 0) {
						await walkChain(next)
					}
				} catch {}
			}
		}
		await walkChain(startTasks)

		const total = chainTasks.length
		let currentIndex = 0

		// Add all cascade targets to undo snapshot upfront
		if (undoStack.value) {
			for (const t of chainTasks) {
				const existing = tasks.value.get(t.id)
				if (existing && !undoStack.value.snapshots.has(t.id)) {
					undoStack.value.snapshots.set(t.id, klona(existing))
				}
			}
		}

		function promptNext() {
			if (currentIndex >= total || !onCascadePrompt.value) {
				// Done — clean up previews, close bubble, refetch for arrows
				clearCascadePreview(previewId)
				if (onCascadeClose.value) onCascadeClose.value()
				if (shiftedIds.size > 0) {
					loadTasks()
				}
				return
			}

			const task = chainTasks[currentIndex]
			const taskName = task.title || `Task #${task.id}`

			onCascadePrompt.value({
				label: `↓ ${taskName}`,
				names: `${currentIndex + 1} of ${total}`,
				absDays,
				direction: dirLabel,
				accentColor,
				barId: String(task.id),
				stepIndex: currentIndex,
				stepTotal: total,
				action: async () => {
					// Shift this task
					const shiftedTask: Record<string, any> = {id: task.id}
					if (task.startDate) shiftedTask.startDate = new Date(new Date(task.startDate).getTime() + deltaMs)
					if (task.endDate) shiftedTask.endDate = new Date(new Date(task.endDate).getTime() + deltaMs)
					if (task.dueDate) shiftedTask.dueDate = new Date(new Date(task.dueDate).getTime() + deltaMs)

					try {
						const updated = await taskService.update({...task, ...shiftedTask})
						tasks.value.set(updated.id, updated)
						shiftedIds.add(updated.id)
						// Remove ghost — task is now at its real position
						const preview = cascadePreviews.value.find(p => p.id === previewId)
						if (preview) {
							preview.taskIds.delete(task.id)
							if (preview.taskIds.size === 0) {
								clearCascadePreview(previewId)
							} else {
								cascadePreviews.value = [...cascadePreviews.value]
							}
						}
					} catch (e) {
						console.error(`Failed to cascade task ${task.id}:`, e)
					}

					currentIndex++
					promptNext()
				},
				skip: () => {
					// Skip this task — remove its ghost bar from the preview
					const preview = cascadePreviews.value.find(p => p.id === previewId)
					if (preview) {
						preview.taskIds.delete(task.id)
						if (preview.taskIds.size === 0) {
							clearCascadePreview(previewId)
						} else {
							// Trigger reactivity by replacing the array entry
							cascadePreviews.value = [...cascadePreviews.value]
						}
					}
					currentIndex++
					promptNext()
				},
				dismiss: () => {
					// Cancel all remaining
					clearCascadePreview(previewId)
					if (onCascadeClose.value) onCascadeClose.value()
					if (shiftedIds.size > 0) {
						loadTasks()
					}
				},
			})
		}

		promptNext()
	}

	function findEarliestDate(tasks: ITask[]): Date | null {
		let earliest: Date | null = null
		for (const t of tasks) {
			if (t.startDate) {
				const d = new Date(t.startDate)
				if (!earliest || d < earliest) earliest = d
			}
		}
		return earliest
	}

	async function cascadeShiftChain(chainTasks: ITask[], deltaDays: number, direction: 'precedes' | 'follows') {
		const deltaMs = deltaDays * 24 * 60 * 60 * 1000

		// Add all cascade targets to undo snapshot
		if (undoStack.value) {
			for (const t of chainTasks) {
				const existing = tasks.value.get(t.id)
				if (existing && !undoStack.value.snapshots.has(t.id)) {
					undoStack.value.snapshots.set(t.id, klona(existing))
				}
			}
		}

		for (const t of chainTasks) {
			const shiftedTask: Record<string, any> = {id: t.id}

			if (t.startDate) {
				shiftedTask.startDate = new Date(new Date(t.startDate).getTime() + deltaMs)
			}
			if (t.endDate) {
				shiftedTask.endDate = new Date(new Date(t.endDate).getTime() + deltaMs)
			}
			if (t.dueDate) {
				shiftedTask.dueDate = new Date(new Date(t.dueDate).getTime() + deltaMs)
			}

			try {
				const updated = await taskService.update({...t, ...shiftedTask})
				tasks.value.set(updated.id, updated)

				// Continue in the same direction only
				try {
					const full = await taskService.get(new TaskModel({id: updated.id}))
					const nextTasks = full?.relatedTasks?.[direction]
					if (nextTasks && Array.isArray(nextTasks) && nextTasks.length > 0) {
						await cascadeShiftChain(nextTasks, deltaDays, direction)
					}
				} catch {
					// End of chain
				}
			} catch (e) {
				console.error(`Failed to cascade task ${t.id}:`, e)
			}
		}
	}


	return {
		tasks,

		isLoading,
		loadTasks,

		addTask,
		updateTask,
		canUndo,
		undoLastAction,
		cascadePreviews,
		onCascadePrompt,
		onCascadeClose,
	}
}
