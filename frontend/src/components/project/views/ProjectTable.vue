<template>
	<ProjectWrapper
		class="project-table"
		:is-loading-project="isLoadingProject"
		:project-id="projectId"
		:view-id
	>
		<template #header>
			<div class="filter-container">
				<Popup>
					<template #trigger="{toggle}">
						<XButton
							icon="th"
							variant="secondary"
							class="mie-2"
							@click.prevent.stop="toggle()"
						>
							{{ $t('project.table.columns') }}
						</XButton>
					</template>
					<template #content="{isOpen}">
						<Card
							class="columns-filter"
							:class="{'is-open': isOpen}"
						>
							<FancyCheckbox v-model="activeColumns.index">
								#
							</FancyCheckbox>
							<FancyCheckbox v-model="activeColumns.done">
								{{ $t('task.attributes.done') }}
							</FancyCheckbox>
							<FancyCheckbox v-model="activeColumns.project">
								{{ $t('task.attributes.project') }}
							</FancyCheckbox>
							<FancyCheckbox v-model="activeColumns.title">
								{{ $t('task.attributes.title') }}
							</FancyCheckbox>
							<FancyCheckbox v-model="activeColumns.priority">
								{{ $t('task.attributes.priority') }}
							</FancyCheckbox>
							<FancyCheckbox v-model="activeColumns.labels">
								{{ $t('task.attributes.labels') }}
							</FancyCheckbox>
							<FancyCheckbox v-model="activeColumns.assignees">
								{{ $t('task.attributes.assignees') }}
							</FancyCheckbox>
							<FancyCheckbox v-model="activeColumns.commentCount">
								{{ $t('task.attributes.commentCount') }}
							</FancyCheckbox>
							<FancyCheckbox v-model="activeColumns.dueDate">
								{{ $t('task.attributes.dueDate') }}
							</FancyCheckbox>
							<FancyCheckbox v-model="activeColumns.startDate">
								{{ $t('task.attributes.startDate') }}
							</FancyCheckbox>
							<FancyCheckbox v-model="activeColumns.endDate">
								{{ $t('task.attributes.endDate') }}
							</FancyCheckbox>
							<FancyCheckbox v-model="activeColumns.percentDone">
								{{ $t('task.attributes.percentDone') }}
							</FancyCheckbox>
							<FancyCheckbox v-model="activeColumns.doneAt">
								{{ $t('task.attributes.doneAt') }}
							</FancyCheckbox>
							<FancyCheckbox v-model="activeColumns.created">
								{{ $t('task.attributes.created') }}
							</FancyCheckbox>
							<FancyCheckbox v-model="activeColumns.updated">
								{{ $t('task.attributes.updated') }}
							</FancyCheckbox>
							<FancyCheckbox v-model="activeColumns.createdBy">
								{{ $t('task.attributes.createdBy') }}
							</FancyCheckbox>
						</Card>
					</template>
				</Popup>
				<FilterPopup
					v-if="!isSavedFilter({id: projectId})"
					v-model="params"
					:view-id="viewId"
					:project-id="projectId"
					@update:modelValue="taskList.loadTasks()"
				/>
				<XButton
					v-if="canWrite"
					variant="secondary"
					icon="layer-group"
					:shadow="false"
					class="mis-2"
					@click="showCreateFromTemplateModal = true"
				>
					{{ $t('task.template.fromTemplate') }}
				</XButton>
				<XButton
					v-if="canWrite"
					variant="secondary"
					icon="link"
					:shadow="false"
					class="mis-2"
					@click="showCreateFromChainModal = true"
				>
					{{ $t('task.chain.createFromChain') }}
				</XButton>
				<SubprojectFilter
					:project-id="projectId"
					@update:includeSubprojects="onSubprojectToggle"
					@update:excludeProjectIds="onExcludeChange"
				/>
			</div>
		</template>

		<template #default>
			<div
				:class="{'is-loading': loading}"
				class="loader-container"
			>
				<!-- Active sort indicator bar -->
				<div v-if="activeSortKeys.length > 0" class="sort-indicator-bar">
					<span class="sort-indicator-label">Sorted by:</span>
					<span
						v-for="(key, idx) in activeSortKeys"
						:key="key"
						class="sort-chip"
						@click="sort(key)"
					>
						{{ getSortLabel(key) }}
						<Icon
							icon="sort-up"
							:rotation="sortBy[key] === 'asc' ? undefined : 180"
							class="sort-chip-icon"
						/>
						<span v-if="activeSortKeys.length > 1" class="sort-chip-priority">{{ idx + 1 }}</span>
						<BaseButton
							class="sort-chip-remove"
							@click.stop="removeSort(key)"
						>
							<Icon icon="times" />
						</BaseButton>
					</span>
					<BaseButton
						v-if="activeSortKeys.length > 1"
						class="sort-clear-all"
						@click="clearAllSorts"
					>
						Clear all
					</BaseButton>
					<span class="sort-hint">Hold Ctrl + click header to multi-sort</span>
				</div>

				<Card
					:padding="false"
					:has-content="false"
				>
					<div class="has-horizontal-overflow">
						<table class="table has-actions is-hoverable is-fullwidth mbe-0 modern-table">
							<thead>
								<tr>
									<th
										v-if="activeColumns.index"
										class="sortable-header col-index"
										:class="{ 'is-sorted': !!sortBy.index }"
										@click="sort('index', $event)"
									>
										<span class="header-content">
											#
											<SortIndicator :order="sortBy.index" :priority="getSortPriority('index')" />
										</span>
									</th>
									<th
										v-if="activeColumns.done"
										class="sortable-header col-done"
										:class="{ 'is-sorted': !!sortBy.done }"
										@click="sort('done', $event)"
									>
										<span class="header-content">
											{{ $t('task.attributes.done') }}
											<SortIndicator :order="sortBy.done" :priority="getSortPriority('done')" />
										</span>
									</th>
									<th
										v-if="activeColumns.project"
										class="sortable-header col-project"
										:class="{ 'is-sorted': !!sortBy.project_id }"
										@click="sort('project_id', $event)"
									>
										<span class="header-content">
											{{ $t('task.attributes.project') }}
											<SortIndicator :order="sortBy.project_id" :priority="getSortPriority('project_id')" />
										</span>
									</th>
									<th
										v-if="activeColumns.title"
										class="sortable-header col-title"
										:class="{ 'is-sorted': !!sortBy.title }"
										@click="sort('title', $event)"
									>
										<span class="header-content">
											{{ $t('task.attributes.title') }}
											<SortIndicator :order="sortBy.title" :priority="getSortPriority('title')" />
										</span>
									</th>
									<th
										v-if="activeColumns.priority"
										class="sortable-header col-priority"
										:class="{ 'is-sorted': !!sortBy.priority }"
										@click="sort('priority', $event)"
									>
										<span class="header-content">
											{{ $t('task.attributes.priority') }}
											<SortIndicator :order="sortBy.priority" :priority="getSortPriority('priority')" />
										</span>
									</th>
									<th v-if="activeColumns.labels" class="col-labels">
										{{ $t('task.attributes.labels') }}
									</th>
									<th v-if="activeColumns.assignees" class="col-assignees">
										{{ $t('task.attributes.assignees') }}
									</th>
									<th
										v-if="activeColumns.dueDate"
										class="sortable-header col-date"
										:class="{ 'is-sorted': !!sortBy.due_date }"
										@click="sort('due_date', $event)"
									>
										<span class="header-content">
											{{ $t('task.attributes.dueDate') }}
											<SortIndicator :order="sortBy.due_date" :priority="getSortPriority('due_date')" />
										</span>
									</th>
									<td v-if="activeColumns.commentCount" class="col-comment">
										{{ $t('task.attributes.commentCount') }}
									</td>
									<th
										v-if="activeColumns.startDate"
										class="sortable-header col-date"
										:class="{ 'is-sorted': !!sortBy.start_date }"
										@click="sort('start_date', $event)"
									>
										<span class="header-content">
											{{ $t('task.attributes.startDate') }}
											<SortIndicator :order="sortBy.start_date" :priority="getSortPriority('start_date')" />
										</span>
									</th>
									<th
										v-if="activeColumns.endDate"
										class="sortable-header col-date"
										:class="{ 'is-sorted': !!sortBy.end_date }"
										@click="sort('end_date', $event)"
									>
										<span class="header-content">
											{{ $t('task.attributes.endDate') }}
											<SortIndicator :order="sortBy.end_date" :priority="getSortPriority('end_date')" />
										</span>
									</th>
									<th
										v-if="activeColumns.percentDone"
										class="sortable-header col-percent"
										:class="{ 'is-sorted': !!sortBy.percent_done }"
										@click="sort('percent_done', $event)"
									>
										<span class="header-content">
											{{ $t('task.attributes.percentDone') }}
											<SortIndicator :order="sortBy.percent_done" :priority="getSortPriority('percent_done')" />
										</span>
									</th>
									<th
										v-if="activeColumns.doneAt"
										class="sortable-header col-date"
										:class="{ 'is-sorted': !!sortBy.done_at }"
										@click="sort('done_at', $event)"
									>
										<span class="header-content">
											{{ $t('task.attributes.doneAt') }}
											<SortIndicator :order="sortBy.done_at" :priority="getSortPriority('done_at')" />
										</span>
									</th>
									<th
										v-if="activeColumns.created"
										class="sortable-header col-date"
										:class="{ 'is-sorted': !!sortBy.created }"
										@click="sort('created', $event)"
									>
										<span class="header-content">
											{{ $t('task.attributes.created') }}
											<SortIndicator :order="sortBy.created" :priority="getSortPriority('created')" />
										</span>
									</th>
									<th
										v-if="activeColumns.updated"
										class="sortable-header col-date"
										:class="{ 'is-sorted': !!sortBy.updated }"
										@click="sort('updated', $event)"
									>
										<span class="header-content">
											{{ $t('task.attributes.updated') }}
											<SortIndicator :order="sortBy.updated" :priority="getSortPriority('updated')" />
										</span>
									</th>
									<th v-if="activeColumns.createdBy" class="col-user">
										{{ $t('task.attributes.createdBy') }}
									</th>
								</tr>
							</thead>
							<tbody>
								<tr
									v-for="t in tasks"
									:key="t.id"
									class="task-row"
									:class="{ 'is-done': t.done }"
								>
									<td v-if="activeColumns.index" class="col-index">
										<RouterLink :to="taskDetailRoutes[t.id]" class="task-id">
											<template v-if="t.identifier === ''">
												#{{ t.index }}
											</template>
											<template v-else>
												{{ t.identifier }}
											</template>
										</RouterLink>
									</td>
									<td v-if="activeColumns.done" class="col-done">
										<Done
											:is-done="t.done"
											variant="small"
										/>
									</td>
									<td v-if="activeColumns.project" class="col-project">
										<RouterLink
											v-if="projectStore.projects[t.projectId]"
											:to="{ name: 'project.index', params: { projectId: t.projectId } }"
											class="project-link"
											:style="getProjectStyle(t.projectId)"
										>
											{{ projectStore.projects[t.projectId].title }}
										</RouterLink>
									</td>
									<td v-if="activeColumns.title" class="col-title">
										<TaskGlanceTooltip :task="t">
											<RouterLink :to="taskDetailRoutes[t.id]" class="task-title-link">
												<Icon
													v-if="t.autoTemplateId > 0"
													icon="bolt"
													v-tooltip="$t('task.autoTask.autoGenIndicator')"
													class="auto-gen-indicator"
												/>
												{{ t.title }}
											</RouterLink>
										</TaskGlanceTooltip>
									</td>
									<td v-if="activeColumns.priority" class="col-priority">
										<PriorityLabel
											:priority="t.priority"
											:done="t.done"
											:show-all="true"
										/>
									</td>
									<td v-if="activeColumns.labels" class="col-labels">
										<Labels :labels="t.labels" />
									</td>
									<td v-if="activeColumns.assignees" class="col-assignees">
										<AssigneeList
											v-if="t.assignees.length > 0"
											:assignees="t.assignees"
											:avatar-size="28"
											class="mis-1"
											:inline="true"
										/>
									</td>
									<DateTableCell
										v-if="activeColumns.dueDate"
										:date="t.dueDate"
										class="col-date"
									/>
									<td v-if="activeColumns.commentCount" class="col-comment">
										<CommentCount :task="t" />
									</td>
									<DateTableCell
										v-if="activeColumns.startDate"
										:date="t.startDate"
										class="col-date"
									/>
									<DateTableCell
										v-if="activeColumns.endDate"
										:date="t.endDate"
										class="col-date"
									/>
									<td v-if="activeColumns.percentDone" class="col-percent">
										<div class="percent-bar-container" v-if="t.percentDone > 0">
											<div class="percent-bar" :style="{ width: (t.percentDone * 100) + '%' }"></div>
											<span class="percent-text">{{ Math.round(t.percentDone * 100) }}%</span>
										</div>
										<span v-else class="empty-cell">—</span>
									</td>
									<DateTableCell
										v-if="activeColumns.doneAt"
										:date="t.doneAt"
										class="col-date"
									/>
									<DateTableCell
										v-if="activeColumns.created"
										:date="t.created"
										class="col-date"
									/>
									<DateTableCell
										v-if="activeColumns.updated"
										:date="t.updated"
										class="col-date"
									/>
									<td v-if="activeColumns.createdBy" class="col-user">
										<User
											:avatar-size="27"
											:show-username="false"
											:user="t.createdBy"
										/>
									</td>
								</tr>
							</tbody>
						</table>
					</div>

					<!-- Row count + pagination -->
					<div class="table-footer">
						<span class="row-count">
							{{ tasks.length }} task{{ tasks.length === 1 ? '' : 's' }}
							<template v-if="totalPages > 1"> · page {{ currentPage }} of {{ totalPages }}</template>
						</span>
						<Pagination
							:total-pages="totalPages"
							:current-page="currentPage"
						/>
					</div>
				</Card>
			</div>
		</template>
	</ProjectWrapper>

	<CreateFromTemplateModal
		:enabled="showCreateFromTemplateModal"
		:default-project-id="projectId"
		@close="showCreateFromTemplateModal = false"
		@created="handleTaskCreatedFromTemplate"
	/>
	<CreateFromChainModal
		:enabled="showCreateFromChainModal"
		:project-id="projectId"
		@close="showCreateFromChainModal = false"
		@created="loadTasks(1)"
	/>
</template>

<script setup lang="ts">
import {computed, ref, type Ref, watch} from 'vue'

import {useStorage} from '@vueuse/core'

import ProjectWrapper from '@/components/project/ProjectWrapper.vue'
import Done from '@/components/misc/Done.vue'
import User from '@/components/misc/User.vue'
import PriorityLabel from '@/components/tasks/partials/PriorityLabel.vue'
import Labels from '@/components/tasks/partials/Labels.vue'
import TaskGlanceTooltip from '@/components/tasks/partials/TaskGlanceTooltip.vue'
import DateTableCell from '@/components/tasks/partials/DateTableCell.vue'
import CommentCount from '@/components/tasks/partials/CommentCount.vue'
import FancyCheckbox from '@/components/input/FancyCheckbox.vue'
import Sort from '@/components/tasks/partials/Sort.vue'
import FilterPopup from '@/components/project/partials/FilterPopup.vue'
import SubprojectFilter from '@/components/project/partials/SubprojectFilter.vue'
import CreateFromTemplateModal from '@/components/tasks/partials/CreateFromTemplateModal.vue'
import CreateFromChainModal from '@/components/tasks/partials/CreateFromChainModal.vue'
import Pagination from '@/components/misc/Pagination.vue'
import Popup from '@/components/misc/Popup.vue'
import BaseButton from '@/components/base/BaseButton.vue'

import type {SortBy} from '@/composables/useTaskList'
import {useTaskList} from '@/composables/useTaskList'
import type {ITask} from '@/modelTypes/ITask'
import type {IProject} from '@/modelTypes/IProject'
import AssigneeList from '@/components/tasks/partials/AssigneeList.vue'
import type {IProjectView} from '@/modelTypes/IProjectView'
import { camelCase } from 'change-case'
import {isSavedFilter} from '@/services/savedFilter'
import {useProjectStore} from '@/stores/projects'
import {getHexColor} from '@/models/task'

// ─────────────────────────────────────────────────────────────
// SortIndicator — inline component for column header sort icons
// ─────────────────────────────────────────────────────────────
const SortIndicator = {
	props: {
		order: { type: String, default: undefined },
		priority: { type: Number, default: 0 },
	},
	components: { Sort },
	template: `
		<span class="sort-indicator">
			<Sort :order="order || 'none'" />
			<span v-if="priority > 0" class="sort-priority-badge">{{ priority }}</span>
		</span>
	`,
}

const props = defineProps<{
	isLoadingProject: boolean,
	projectId: IProject['id'],
	viewId: IProjectView['id'],
}>()

const projectStore = useProjectStore()

const showCreateFromTemplateModal = ref(false)
const showCreateFromChainModal = ref(false)

const subprojectParams = ref<Record<string, unknown>>({})

function onSubprojectToggle(enabled: boolean) {
	if (enabled) {
		subprojectParams.value = {...subprojectParams.value, include_subprojects: true}
	} else {
		const {include_subprojects, exclude_project_ids, ...rest} = subprojectParams.value
		subprojectParams.value = rest
	}
}

function onExcludeChange(ids: string) {
	if (ids) {
		subprojectParams.value = {...subprojectParams.value, exclude_project_ids: ids}
	} else {
		const {exclude_project_ids, ...rest} = subprojectParams.value
		subprojectParams.value = rest
	}
}

const ACTIVE_COLUMNS_DEFAULT = {
	index: true,
	done: true,
	project: true,
	title: true,
	priority: false,
	labels: true,
	assignees: true,
	dueDate: true,
	startDate: false,
	endDate: false,
	percentDone: false,
	created: false,
	updated: false,
	createdBy: false,
	doneAt: false,
	commentCount: false,
}

const SORT_BY_DEFAULT: SortBy = {
	index: 'desc',
}

const activeColumns = useStorage('tableViewColumns', {...ACTIVE_COLUMNS_DEFAULT})
const sortBy = useStorage<SortBy>('tableViewSortBy', {...SORT_BY_DEFAULT})
const sortOrder = useStorage<string[]>('tableViewSortOrder', ['index'])

const taskList = useTaskList(
	() => props.projectId, 
	() => props.viewId, 
	sortBy.value,
	() => ['comment_count', 'is_unread'],
	() => subprojectParams.value,
)

const {
	loading,
	params,
	totalPages,
	currentPage,
	sortByParam,
} = taskList
const tasks: Ref<ITask[]> = taskList.tasks

watch(
	() => activeColumns.value,
	() => setActiveColumnsSortParam(),
	{deep: true},
)

function handleTaskCreatedFromTemplate(createdTask: ITask) {
	if (createdTask.projectId === props.projectId) {
		taskList.loadTasks()
	}
}

// ─────────────────────────────────────────────────────────────
// Project column styling — colored left border from project hex
// ─────────────────────────────────────────────────────────────
function getProjectStyle(projectId: number): Record<string, string> {
	const project = projectStore.projects[projectId]
	if (!project) return {}
	const color = getHexColor(project.hexColor ?? '')
	if (!color) return {}
	return {
		'border-inline-start': `3px solid ${color}`,
		'padding-inline-start': '0.5rem',
		'border-radius': '2px',
	}
}

// ─────────────────────────────────────────────────────────────
// Sort logic — multi-column with Ctrl+click
// Single click: replace all | Ctrl+click: add/toggle
// Cycle: → desc → asc → (remove)
// ─────────────────────────────────────────────────────────────
const activeSortKeys = computed(() => {
	const keys = Object.keys(sortBy.value).filter(k => sortBy.value[k] && sortBy.value[k] !== 'none')
	const ordered = sortOrder.value.filter(k => keys.includes(k))
	for (const k of keys) {
		if (!ordered.includes(k)) ordered.push(k)
	}
	return ordered
})

function sort(property: keyof SortBy, event?: MouseEvent) {
	const ctrlPressed = event?.ctrlKey || event?.metaKey

	const currentOrder = sortBy.value[property]
	let newOrder: 'asc' | 'desc' | 'none' | undefined = undefined
	if (typeof currentOrder === 'undefined' || currentOrder === 'none') {
		newOrder = 'desc'
	} else if (currentOrder === 'desc') {
		newOrder = 'asc'
	}

	if (!ctrlPressed) {
		sortBy.value = {} as SortBy
		sortOrder.value = []
	}

	if (newOrder) {
		sortBy.value[property] = newOrder
		if (!sortOrder.value.includes(property as string)) {
			sortOrder.value = [...sortOrder.value, property as string]
		}
	} else {
		delete sortBy.value[property]
		sortOrder.value = sortOrder.value.filter(k => k !== property)
	}

	setActiveColumnsSortParam()
}

function removeSort(key: string) {
	delete sortBy.value[key]
	sortOrder.value = sortOrder.value.filter(k => k !== key)
	setActiveColumnsSortParam()
}

function clearAllSorts() {
	sortBy.value = {} as SortBy
	sortOrder.value = []
	setActiveColumnsSortParam()
}

function getSortPriority(key: string): number {
	if (activeSortKeys.value.length <= 1) return 0
	const idx = sortOrder.value.indexOf(key)
	return idx >= 0 ? idx + 1 : 0
}

const SORT_LABELS: Record<string, string> = {
	index: '#',
	done: 'Done',
	title: 'Title',
	priority: 'Priority',
	project_id: 'Project',
	due_date: 'Due Date',
	start_date: 'Start Date',
	end_date: 'End Date',
	percent_done: '% Done',
	done_at: 'Done At',
	created: 'Created',
	updated: 'Updated',
}

function getSortLabel(key: string): string {
	return SORT_LABELS[key] || key
}

function setActiveColumnsSortParam() {
	sortByParam.value = Object.keys(sortBy.value)
		.filter(prop => {
			if (prop === 'project_id') return activeColumns.value.project
			return activeColumns.value[camelCase(prop)]
		})
		.reduce((obj, key) => {
			obj[key] = sortBy.value[key]
			return obj
		}, {})
}

const taskDetailRoutes = computed(() => Object.fromEntries(
	tasks.value.map(({id}) => ([
		id,
		{
			name: 'task.detail',
			params: {id},
		},
	])),
))
</script>

<style lang="scss" scoped>
.table {
	background: transparent;
	overflow-x: auto;
	overflow-y: hidden;

	th {
		white-space: nowrap;
	}

	.user {
		margin: 0;
	}
}

// ── Modern table ──
.modern-table {
	border-collapse: separate;
	border-spacing: 0;

	// Sticky header
	thead {
		position: sticky;
		inset-block-start: 0;
		z-index: 2;

		th, td {
			background: var(--site-background, var(--grey-100));
			border-block-end: 2px solid var(--grey-300);
			font-size: 0.8rem;
			font-weight: 700;
			text-transform: uppercase;
			letter-spacing: 0.03em;
			color: var(--grey-500);
			padding: 0.6rem 0.75rem;
		}
	}

	// Row styling
	tbody {
		tr {
			transition: background 100ms ease;

			&:nth-child(even) {
				background: rgba(var(--grey-100-rgb, 128, 128, 128), 0.03);
			}

			&:hover {
				background: rgba(var(--primary-rgb, 29, 111, 220), 0.04);
			}
		}

		td {
			padding: 0.55rem 0.75rem;
			vertical-align: middle;
			border-block-end: 1px solid var(--grey-200);
			font-size: 0.9rem;
		}
	}

	// Done row dimming
	.task-row.is-done {
		opacity: 0.55;

		&:hover {
			opacity: 0.8;
		}
	}
}

// ── Column widths ──
.col-index { width: 60px; }
.col-done { width: 70px; }
.col-project { min-width: 120px; max-width: 180px; }
.col-title { min-width: 200px; }
.col-priority { width: 90px; }
.col-labels { min-width: 120px; }
.col-assignees { min-width: 100px; }
.col-date { width: 110px; white-space: nowrap; }
.col-comment { width: 60px; }
.col-percent { width: 100px; }
.col-user { width: 50px; }

.task-id {
	font-family: monospace;
	font-size: 0.8rem;
	color: var(--grey-500);
}

.project-link {
	font-size: 0.85rem;
	font-weight: 500;
	display: inline-block;
	max-width: 160px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.task-title-link {
	font-weight: 500;
}

.empty-cell {
	color: var(--grey-400);
	font-size: 0.8rem;
}

// ── Percent done mini bar ──
.percent-bar-container {
	position: relative;
	background: var(--grey-200);
	border-radius: 4px;
	height: 18px;
	overflow: hidden;
	min-width: 60px;
}

.percent-bar {
	height: 100%;
	background: var(--primary);
	border-radius: 4px;
	transition: width 200ms ease;
}

.percent-text {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 0.7rem;
	font-weight: 700;
	color: var(--grey-800);
}

// ── Table footer ──
.table-footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 0.5rem 0.75rem;
	border-block-start: 1px solid var(--grey-200);
}

.row-count {
	font-size: 0.8rem;
	color: var(--grey-500);
	font-weight: 500;
}

// ── Sortable headers ──
.sortable-header {
	cursor: pointer;
	user-select: none;
	transition: background 150ms ease;

	&:hover {
		background: rgba(var(--primary-rgb, 29, 111, 220), 0.08);
	}

	&.is-sorted {
		background: rgba(var(--primary-rgb, 29, 111, 220), 0.06);
		color: var(--primary);
	}
}

.header-content {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
}

.sort-indicator {
	display: inline-flex;
	align-items: center;
	position: relative;

	:deep(.sort__icon) {
		transition: color 150ms ease;
	}
}

.sortable-header:hover .sort-indicator :deep(.sort__icon) {
	color: var(--grey-500);
}

.sortable-header.is-sorted .sort-indicator :deep(.sort__icon) {
	color: var(--primary);
}

:deep(.sort-priority-badge) {
	position: absolute;
	inset-block-start: -7px;
	inset-inline-end: -9px;
	background: var(--primary);
	color: white;
	font-size: 0.55rem;
	font-weight: 700;
	inline-size: 13px;
	block-size: 13px;
	line-height: 13px;
	text-align: center;
	border-radius: 50%;
	pointer-events: none;
}

// ── Sort bar ──
.sort-indicator-bar {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.45rem 0.75rem;
	margin-block-end: 0.5rem;
	background: var(--grey-100);
	border-radius: 8px;
	font-size: 0.8rem;
	flex-wrap: wrap;
}

.sort-indicator-label {
	color: var(--grey-500);
	font-weight: 600;
	white-space: nowrap;
}

.sort-chip {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	padding: 0.2rem 0.5rem;
	background: var(--primary);
	color: white;
	border-radius: 4px;
	font-weight: 600;
	font-size: 0.75rem;
	cursor: pointer;
	transition: background 150ms ease;
	white-space: nowrap;

	&:hover {
		filter: brightness(0.85);
	}
}

.sort-chip-icon { font-size: 0.65rem; }

.sort-chip-priority {
	background: rgba(255, 255, 255, 0.3);
	border-radius: 50%;
	inline-size: 16px;
	block-size: 16px;
	line-height: 16px;
	text-align: center;
	font-size: 0.6rem;
}

.sort-chip-remove {
	color: rgba(255, 255, 255, 0.7);
	font-size: 0.65rem;
	margin-inline-start: 0.1rem;
	&:hover { color: white; }
}

.sort-clear-all {
	color: var(--grey-500);
	font-size: 0.75rem;
	text-decoration: underline;
	&:hover { color: var(--danger); }
}

.sort-hint {
	color: var(--grey-400);
	font-size: 0.7rem;
	margin-inline-start: auto;
	white-space: nowrap;
}

// ── Existing ──
.columns-filter {
	margin: 0;

	:deep(.card-content .content) {
		display: flex;
		flex-direction: column;
	}

	&.is-open {
		margin: 2rem 0 1rem;
	}
}

.link-share-view .card {
	border: none;
	box-shadow: none;
}

.filter-container :deep(.popup) {
	inset-block-start: 7rem;
}

.auto-gen-indicator {
	color: var(--warning);
	font-size: .75rem;
	margin-inline-end: .25rem;
}
</style>
