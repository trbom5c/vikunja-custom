<template>
	<ProjectWrapper
		class="project-gantt"
		:is-loading-project="isLoadingProject"
		:project-id="filters.projectId"
		:view-id
	>
		<template #default>
			<div class="gantt-toolbar">
				<div class="gantt-toolbar-left">
					<Foo
						id="range"
						ref="flatPickerEl"
						v-model="flatPickerDateRange"
						:config="flatPickerConfig"
						class="gantt-date-input"
						:placeholder="$t('project.gantt.range')"
					/>
					<FancyCheckbox
						v-model="filters.showTasksWithoutDates"
						is-block
						class="gantt-checkbox"
					>
						{{ $t('task.show.noDates') }}
					</FancyCheckbox>
					<FancyCheckbox
						v-model="filters.showDoneTasks"
						is-block
						class="gantt-checkbox"
					>
						{{ $t('task.show.completed') }}
					</FancyCheckbox>
				</div>
				<div class="gantt-toolbar-right">
					<SubprojectFilter
						:project-id="filters.projectId"
						:show-legend="true"
						@update:includeSubprojects="onSubprojectToggle"
						@update:excludeProjectIds="onExcludeChange"
						@update:colorMap="onColorMapChange"
					/>
					<GanttArrowSettings />
					<XButton
						v-if="canUndo"
						variant="tertiary"
						icon="undo"
						class="gantt-undo-btn"
						@click="undoLastAction"
					>
						Undo
					</XButton>
					<span class="gantt-zoom-hint">Ctrl + scroll to zoom</span>
				</div>
			</div>

			<div class="gantt-chart-container">
				<Card
					:has-content="false"
					:padding="false"
					class="has-overflow"
				>
					<GanttChart
						ref="ganttChartRef"
						:filters="filters"
						:tasks="tasks"
						:is-loading="isLoading"
						:default-task-start-date="defaultTaskStartDate"
						:default-task-end-date="defaultTaskEndDate"
						:subproject-color-map="subprojectColorMap"
						:cascade-previews="cascadePreviews"
						@update:task="updateTask"
					/>
					<div class="gantt-bottom-bar">
						<TaskForm
							v-if="canWrite"
							@createTask="addGanttTask"
						/>
						<XButton
							v-if="canWrite"
							variant="primary"
							icon="layer-group"
							class="gantt-action-btn"
							@click="showCreateFromTemplateModal = true"
						>
							{{ $t('task.template.fromTemplate') }}
						</XButton>
						<XButton
							v-if="canWrite"
							variant="primary"
							icon="link"
							class="gantt-action-btn"
							@click="showCreateFromChainModal = true"
						>
							{{ $t('task.chain.createFromChain') }}
						</XButton>
					</div>
				</Card>
			</div>
		</template>
	</ProjectWrapper>

	<CreateFromTemplateModal
		:enabled="showCreateFromTemplateModal"
		:default-project-id="filters.projectId"
		@close="showCreateFromTemplateModal = false"
		@created="onTaskCreatedFromTemplate"
	/>
	<CreateFromChainModal
		:enabled="showCreateFromChainModal"
		:project-id="filters.projectId"
		@close="showCreateFromChainModal = false"
		@created="loadTasks()"
	/>
</template>

<script setup lang="ts">
import {computed, ref, toRefs} from 'vue'
import type Flatpickr from 'flatpickr'
import {useI18n} from 'vue-i18n'
import type {RouteLocationNormalized} from 'vue-router'

import {useBaseStore} from '@/stores/base'
import {useFlatpickrLanguage} from '@/helpers/useFlatpickrLanguage'

import Foo from '@/components/misc/flatpickr/Flatpickr.vue'
import ProjectWrapper from '@/components/project/ProjectWrapper.vue'
import FancyCheckbox from '@/components/input/FancyCheckbox.vue'
import TaskForm from '@/components/tasks/TaskForm.vue'

import GanttChart from '@/components/gantt/GanttChart.vue'
import SubprojectFilter from '@/components/project/partials/SubprojectFilter.vue'
import GanttArrowSettings from '@/components/gantt/GanttArrowSettings.vue'
import CreateFromTemplateModal from '@/components/tasks/partials/CreateFromTemplateModal.vue'
import CreateFromChainModal from '@/components/tasks/partials/CreateFromChainModal.vue'
import {useGanttFilters} from '../../../views/project/helpers/useGanttFilters'
import {PERMISSIONS} from '@/constants/permissions'

import type {DateISO} from '@/types/DateISO'
import type {ITask} from '@/modelTypes/ITask'
import type {IProjectView} from '@/modelTypes/IProjectView'

type Options = Flatpickr.Options.Options

const props = defineProps<{
	isLoadingProject: boolean,
	route: RouteLocationNormalized
	viewId: IProjectView['id']
}>()


const baseStore = useBaseStore()
const canWrite = computed(() => baseStore.currentProject?.maxPermission > PERMISSIONS.READ)

const {route, viewId} = toRefs(props)

const subprojectParams = ref<Record<string, unknown>>({})
const subprojectColorMap = ref<Map<number, string>>(new Map())
const showCreateFromTemplateModal = ref(false)
const showCreateFromChainModal = ref(false)

function onSubprojectToggle(enabled: boolean) {
	if (enabled) {
		subprojectParams.value = {...subprojectParams.value, include_subprojects: true}
	} else {
		const {include_subprojects, exclude_project_ids, ...rest} = subprojectParams.value
		subprojectParams.value = rest
	}
	loadTasks()
}

function onExcludeChange(ids: string) {
	if (ids) {
		subprojectParams.value = {...subprojectParams.value, exclude_project_ids: ids}
	} else {
		const {exclude_project_ids, ...rest} = subprojectParams.value
		subprojectParams.value = rest
	}
	loadTasks()
}

function onColorMapChange(map: Map<number, string>) {
	subprojectColorMap.value = map
}

function onTaskCreatedFromTemplate(createdTask: ITask) {
	if (createdTask.projectId === filters.value.projectId) {
		loadTasks()
	}
}

const {
	filters,
	tasks,
	isLoading,
	addTask,
	updateTask,
	loadTasks,
	canUndo,
	undoLastAction,
	cascadePreviews,
	onCascadePrompt,
	onCascadeClose,
} = useGanttFilters(route, viewId, subprojectParams)

// Ref to GanttChart for cascade bubble
const ganttChartRef = ref<InstanceType<typeof GanttChart> | null>(null)

// Wire cascade prompts to the bubble in GanttChart
onCascadePrompt.value = (info) => {
	if (ganttChartRef.value?.showCascadeInBubble) {
		ganttChartRef.value.showCascadeInBubble(info)
	}
}

// Wire cascade close to dismiss the bubble
onCascadeClose.value = () => {
	if (ganttChartRef.value?.closeCascadeBubble) {
		ganttChartRef.value.closeCascadeBubble()
	}
}

const DEFAULT_DATE_RANGE_DAYS = 7

const today = new Date()
const defaultTaskStartDate: DateISO = new Date(today.setHours(0, 0, 0, 0)).toISOString()
const defaultTaskEndDate: DateISO = new Date(new Date(
	today.getFullYear(),
	today.getMonth(),
	today.getDate() + DEFAULT_DATE_RANGE_DAYS,
).setHours(23, 59, 0, 0)).toISOString()

async function addGanttTask(title: ITask['title']) {
	return await addTask({
		title,
		projectId: filters.value.projectId,
		startDate: defaultTaskStartDate,
		endDate: defaultTaskEndDate,
	})
}

const flatPickerEl = ref<typeof Foo | null>(null)
const flatPickerDateRange = computed<Date[]>({
	get: () => ([
		new Date(filters.value.dateFrom),
		new Date(filters.value.dateTo),
	]),
	set(newVal) {
		const [dateFrom, dateTo] = newVal.map((date) => date?.toISOString())

		// only set after whole range has been selected
		if (!dateTo) return

		Object.assign(filters.value, {dateFrom, dateTo})
	},
})

const initialDateRange = [filters.value.dateFrom, filters.value.dateTo]

const {t} = useI18n({useScope: 'global'})
const flatPickerConfig = computed(() => ({
	altFormat: t('date.altFormatShort'),
	altInput: true,
	defaultDate: initialDateRange,
	enableTime: false,
	mode: 'range',
	locale: useFlatpickrLanguage().value,
} as Options))
</script>

<style lang="scss" scoped>
.gantt-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: .35rem .75rem;
	padding: .4rem .75rem;
	margin-block-end: .25rem;
	font-size: .8rem;

	@media screen and (max-width: $tablet) {
		flex-direction: column;
		align-items: stretch;
		gap: .5rem;
	}
}

.gantt-toolbar-left,
.gantt-toolbar-right {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: .35rem .6rem;
}

.gantt-toolbar-right {
	margin-inline-start: auto;

	@media screen and (max-width: $tablet) {
		margin-inline-start: 0;
	}
}

.gantt-date-input {
	font-size: .75rem;
	padding: .25rem .5rem;
	border-radius: 4px;
	border: 1px solid var(--grey-700, #555);
	background: var(--grey-800, #222);
	color: var(--grey-100, #eee);
	min-inline-size: 170px;
	max-inline-size: 220px;
	cursor: pointer;

	&:focus {
		border-color: var(--primary);
		outline: none;
	}
}

// Override flatpickr altInput styling
:deep(.gantt-date-input + .flatpickr-input) {
	font-size: .75rem !important;
	padding: .25rem .5rem !important;
	border-radius: 4px !important;
	border: 1px solid var(--grey-700, #555) !important;
	background: var(--grey-800, #222) !important;
	color: var(--grey-100, #eee) !important;
	block-size: auto !important;
	min-inline-size: 170px;
	max-inline-size: 220px;
}

.gantt-checkbox {
	font-size: .75rem;
	white-space: nowrap;

	:deep(.fancycheckbox__label) {
		font-size: .75rem;
	}
}

.gantt-chart-container {
	padding-block-end: 1rem;
}

.gantt-bottom-bar {
	display: flex;
	align-items: center;
	gap: .5rem;
	padding: .5rem;
	flex-wrap: wrap;

	:deep(.add-new-task) {
		padding: 0;
		margin: 0;

		.button {
			font-size: .8rem;
			padding-block: .4rem;
			padding-inline: .75rem;
		}
	}
}

.gantt-action-btn {
	font-size: .8rem;
	padding-block: .4rem;
	padding-inline: .75rem;
}

.gantt-undo-btn {
	white-space: nowrap;
	font-size: .75rem;
}

.gantt-zoom-hint {
	font-size: .6rem;
	color: var(--grey-500, #777);
	white-space: nowrap;
	user-select: none;
	opacity: 0.7;
}

// Kill any inherited .field styles leaking in
:deep(.field) {
	margin-block-end: 0;
}
</style>
