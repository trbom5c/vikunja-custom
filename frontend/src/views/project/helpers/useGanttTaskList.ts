import {computed, ref, type Ref, shallowReactive, watch, type ComputedRef} from 'vue'
import {klona} from 'klona/lite'

import type {Filters} from '@/composables/useRouteFilters'
import type {ITask, ITaskPartialWithId} from '@/modelTypes/ITask'

import TaskCollectionService, {type TaskFilterParams} from '@/services/taskCollection'
import TaskService from '@/services/task'

import TaskModel from '@/models/task'
import {error, success} from '@/message'
import {useAuthStore} from '@/stores/auth'
import {useTaskStore} from '@/stores/tasks'
import type {IProjectView} from '@/modelTypes/IProjectView'

export interface UseGanttTaskListReturn {
	tasks: Ref<Map<ITask['id'], ITask>>
	isLoading: ComputedRef<boolean>
	loadTasks: () => Promise<void>
	addTask: (task: Partial<ITask>) => Promise<ITask>
	updateTask: (task: ITaskPartialWithId) => Promise<void>
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
			success('Saved')

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
		}
	}

	async function checkCascadeDownstream(updatedTask: ITask, oldTask: ITask) {
		try {
			const fullTask = await taskService.get(new TaskModel({id: updatedTask.id}))
			// "precedes" = tasks that come AFTER this one (downstream successors)
			const successors = fullTask?.relatedTasks?.precedes

			if (!successors || !Array.isArray(successors) || successors.length === 0) return

			const oldStart = oldTask.startDate ? new Date(oldTask.startDate).getTime() : 0
			const newStart = updatedTask.startDate ? new Date(updatedTask.startDate).getTime() : 0
			if (oldStart === 0 || newStart === 0) return

			const deltaDays = Math.round((newStart - oldStart) / (1000 * 60 * 60 * 24))
			if (deltaDays === 0) return

			const absDays = Math.abs(deltaDays)
			const direction = deltaDays > 0 ? 'forward' : 'back'

			// Past-date safety check
			if (deltaDays < 0) {
				const today = new Date()
				today.setHours(0, 0, 0, 0)
				const earliest = findEarliestDate(successors)
				if (earliest) {
					const shifted = new Date(earliest.getTime() + deltaDays * 24 * 60 * 60 * 1000)
					if (shifted < today) {
						window.alert(`Cannot shift downstream — would move tasks to ${shifted.toLocaleDateString()}, which is in the past.`)
						return
					}
				}
			}

			const confirmed = window.confirm(`Shift ${successors.length} downstream task(s) ${absDays} day(s) ${direction}?`)
			if (confirmed) {
				await cascadeShiftDownstream(successors, deltaDays)
			}
		} catch (e) {
			console.error('Failed to check cascade:', e)
		}
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

	async function cascadeShiftDownstream(successors: ITask[], deltaDays: number) {
		const deltaMs = deltaDays * 24 * 60 * 60 * 1000

		for (const t of successors) {
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

				// Continue downstream: get THIS task's successors (precedes)
				try {
					const full = await taskService.get(new TaskModel({id: updated.id}))
					const nextSuccessors = full?.relatedTasks?.precedes
					if (nextSuccessors && Array.isArray(nextSuccessors) && nextSuccessors.length > 0) {
						await cascadeShiftDownstream(nextSuccessors, deltaDays)
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
	}
}
