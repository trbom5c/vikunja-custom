<template>
	<Modal
		@close="!isDeleting && $router.back()"
		@submit="deleteProject()"
	>
		<!-- When deleting: use the default slot to take full control, hiding the action buttons -->
		<template v-if="isDeleting" #default>
			<div class="modal-header">
				<span>{{ $t('project.delete.header') }}</span>
			</div>
			<div class="content">
				<div class="deleting-progress">
					<Loading class="is-loading" variant="default" />
					<p class="deleting-text">
						Deleting {{ totalTasks ?? '' }} tasks across {{ projectIdsToDelete.length }} project{{ projectIdsToDelete.length === 1 ? '' : 's' }}...
					</p>
					<p class="deleting-hint">
						This may take a moment for large projects.
					</p>
				</div>
			</div>
		</template>

		<!-- Normal state: use named slots so Modal renders its own Cancel/DO IT buttons -->
		<template v-if="!isDeleting" #header>
			<span>{{ $t('project.delete.header') }}</span>
		</template>

		<template v-if="!isDeleting" #text>
			<p>
				{{ $t('project.delete.text1') }}
			</p>

			<p
				v-if="totalTasks !== null"
				class="has-text-weight-bold"
			>
				{{ deleteNotice }}
			</p>
			<Loading
				v-else
				class="is-loading-small"
				variant="default"
			/>

			<p>
				{{ $t('misc.cannotBeUndone') }}
			</p>
		</template>
	</Modal>
</template>

<script setup lang="ts">
import {computed, ref, watchEffect} from 'vue'
import {useTitle} from '@/composables/useTitle'
import {useI18n} from 'vue-i18n'
import {useRoute, useRouter} from 'vue-router'
import {success} from '@/message'
import Loading from '@/components/misc/Loading.vue'
import {useProjectStore} from '@/stores/projects'
import TaskService from '@/services/task'

const {t} = useI18n({useScope: 'global'})
const projectStore = useProjectStore()
const route = useRoute()
const router = useRouter()

const totalTasks = ref<number | null>(null)
const isDeleting = ref(false)

const project = computed(() => projectStore.projects[route.params.projectId])
const projectIdsToDelete = ref<number[]>([])

watchEffect(
	async () => {
		if (!route.params.projectId) {
			return
		}

		projectIdsToDelete.value = projectStore
			.getChildProjects(parseInt(route.params.projectId))
			.map(p => p.id)

		projectIdsToDelete.value.push(parseInt(route.params.projectId))

		const taskService = new TaskService()
		await taskService.getAll({}, {filter: `project in ${projectIdsToDelete.value.join(',')}`})
		totalTasks.value = taskService.totalPages * taskService.resultCount
	},
)

useTitle(() => t('project.delete.title', {project: project?.value?.title}))

const deleteNotice = computed(() => {
	if(totalTasks.value && totalTasks.value > 0) {
		if (projectIdsToDelete.value.length <= 1) {
			return t('project.delete.tasksToDelete', {count: totalTasks.value})
		} else if (projectIdsToDelete.value.length > 1) {
			return t('project.delete.tasksAndChildProjectsToDelete', {tasks: totalTasks.value, projects: projectIdsToDelete.value.length})
		}
	}

	return t('project.delete.noTasksToDelete')
})

async function deleteProject() {
	if (!project.value || isDeleting.value) {
		return
	}

	isDeleting.value = true

	try {
		await projectStore.deleteProject(project.value)
		success({message: t('project.delete.success')})
		router.push({name: 'home'})
	} catch (e) {
		// If deletion fails, return to confirmation state so user can retry
		isDeleting.value = false
		throw e
	}
}
</script>

<style scoped lang="scss">
.deleting-progress {
	text-align: center;
	padding: 1.5rem 0;
}

.deleting-text {
	margin-block-start: 1rem;
	font-weight: 600;
	font-size: 1.05rem;
}

.deleting-hint {
	margin-block-start: 0.5rem;
	color: var(--grey-500);
	font-size: 0.9rem;
}
</style>
