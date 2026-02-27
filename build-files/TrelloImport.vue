<template>
	<div class="content-widescreen">
		<h1>Import from Trello (JSON)</h1>
		<p>Upload a Trello board export (.json) to import lists as sub-projects with all cards, labels, descriptions, checklists, due dates, and assignments.</p>

		<!-- Step 1: Upload -->
		<div v-if="!boardData" class="upload-section">
			<Message v-if="parseError" variant="danger" class="mbe-4">
				{{ parseError }}
			</Message>
			<div
				class="upload-dropzone"
				:class="{ 'is-dragover': isDragover }"
				@dragover.prevent="isDragover = true"
				@dragleave="isDragover = false"
				@drop.prevent="handleDrop"
				@click="fileInput?.click()"
			>
				<Icon icon="file-import" class="upload-icon" />
				<p class="upload-text">Drop your Trello JSON file here or click to browse</p>
				<p class="upload-hint">Export from Trello: Board menu → Print and export → Export as JSON</p>
			</div>
			<input
				ref="fileInput"
				type="file"
				accept=".json"
				class="is-hidden"
				@change="handleFileSelect"
			>
		</div>

		<!-- Step 2: Preview & Configure -->
		<div v-else-if="!isImporting && !importComplete" class="preview-section">
			<div class="board-header">
				<h2>{{ boardData.name }}</h2>
				<p v-if="boardData.desc" class="board-desc">{{ boardData.desc }}</p>
				<div class="board-stats">
					<span class="stat"><strong>{{ openLists.length }}</strong> lists</span>
					<span class="stat"><strong>{{ openCards.length }}</strong> cards</span>
					<span class="stat"><strong>{{ boardLabels.length }}</strong> labels</span>
					<span class="stat"><strong>{{ boardChecklists.length }}</strong> checklists</span>
				</div>
			</div>

			<!-- Import Options -->
			<div class="import-options">
				<h3>Import Options</h3>

				<div class="option-row">
					<label class="option-label">
						<input v-model="options.projectName" type="text" class="input" placeholder="Project name">
						<span class="option-desc">Project name in Vikunja</span>
					</label>
				</div>

				<div class="option-row">
					<label class="option-label">
						<input v-model="options.listsAsSubProjects" type="checkbox">
						<span>Create each Trello list as a sub-project</span>
					</label>
					<span class="option-desc">If unchecked, lists become views within a single project</span>
				</div>

				<div class="option-row">
					<label class="option-label">
						<input v-model="options.importArchived" type="checkbox">
						<span>Import archived (closed) cards</span>
					</label>
					<span class="option-desc">{{ closedCardCount }} archived cards found</span>
				</div>

				<div class="option-row">
					<label class="option-label">
						<input v-model="options.importClosedLists" type="checkbox">
						<span>Import archived lists</span>
					</label>
					<span class="option-desc">{{ closedListCount }} archived lists found</span>
				</div>

				<div class="option-row">
					<label class="option-label">
						<input v-model="options.importChecklists" type="checkbox">
						<span>Import checklists as markdown in task description</span>
					</label>
				</div>

				<div class="option-row">
					<label class="option-label">
						<input v-model="options.importLabels" type="checkbox">
						<span>Import labels</span>
					</label>
				</div>

				<div class="option-row">
					<label class="option-label">
						<input v-model="options.markDueCompleteAsDone" type="checkbox">
						<span>Mark cards with completed due dates as done</span>
					</label>
				</div>
			</div>

			<!-- List Selection -->
			<div class="list-selection">
				<h3>Lists to Import</h3>
				<div class="list-grid">
					<label
						v-for="list in allLists"
						:key="list.id"
						class="list-item"
						:class="{ 'is-closed': list.closed, 'is-selected': selectedListIds.has(list.id) }"
					>
						<input
							type="checkbox"
							:checked="selectedListIds.has(list.id)"
							@change="toggleList(list.id)"
						>
						<span class="list-name">{{ list.name }}</span>
						<span class="list-count">{{ getCardCount(list.id) }} cards</span>
						<span v-if="list.closed" class="list-badge archived">archived</span>
					</label>
				</div>
			</div>

			<!-- Label Preview -->
			<div v-if="options.importLabels && boardLabels.length > 0" class="label-preview">
				<h3>Labels</h3>
				<div class="label-chips">
					<span
						v-for="label in boardLabels"
						:key="label.id"
						class="label-chip"
						:style="{ backgroundColor: trelloColorToHex(label.color), color: trelloColorTextColor(label.color) }"
					>
						{{ label.name || '(unnamed)' }}
					</span>
				</div>
			</div>

			<!-- Action Buttons -->
			<div class="action-buttons">
				<XButton @click="startImport" variant="primary" :disabled="selectedListIds.size === 0">
					Import {{ totalSelectedCards }} cards from {{ selectedListIds.size }} lists
				</XButton>
				<XButton @click="resetImport" variant="tertiary">
					Cancel
				</XButton>
			</div>
		</div>

		<!-- Step 3: Import Progress -->
		<div v-else-if="isImporting" class="progress-section">
			<h2>Importing...</h2>
			<div class="progress-bar-container">
				<div class="progress-bar" :style="{ width: progressPercent + '%' }"></div>
			</div>
			<p class="progress-text">{{ progressText }}</p>
			<div v-if="importLog.length > 0" class="import-log">
				<div
					v-for="(entry, i) in importLog.slice(-8)"
					:key="i"
					class="log-entry"
					:class="entry.type"
				>
					{{ entry.message }}
				</div>
			</div>
		</div>

		<!-- Step 4: Import Complete -->
		<div v-else-if="importComplete" class="complete-section">
			<div class="complete-icon">✓</div>
			<h2>Import Complete!</h2>
			<div class="complete-stats">
				<div class="complete-stat">
					<strong>{{ importStats.projects }}</strong>
					<span>{{ importStats.projects === 1 ? 'project' : 'projects' }}</span>
				</div>
				<div class="complete-stat">
					<strong>{{ importStats.tasks }}</strong>
					<span>tasks</span>
				</div>
				<div class="complete-stat">
					<strong>{{ importStats.labels }}</strong>
					<span>labels</span>
				</div>
				<div class="complete-stat" v-if="importStats.datesSet > 0">
					<strong>{{ importStats.datesSet }}</strong>
					<span>with dates</span>
				</div>
			</div>
			<div v-if="importStats.errors > 0" class="complete-errors">
				<Message variant="warning">
					{{ importStats.errors }} items could not be imported. Check the log below for details.
				</Message>
			</div>
			<div class="action-buttons">
				<XButton :to="{ name: 'project.index', params: { projectId: createdProjectId } }" variant="primary">
					Go to Project
				</XButton>
				<XButton @click="resetImport" variant="tertiary">
					Import Another
				</XButton>
			</div>
			<div v-if="importLog.length > 0" class="import-log is-complete">
				<h3>Import Log</h3>
				<div
					v-for="(entry, i) in importLog"
					:key="i"
					class="log-entry"
					:class="entry.type"
				>
					{{ entry.message }}
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import {ref, computed} from 'vue'
import {useProjectStore} from '@/stores/projects'
import Message from '@/components/misc/Message.vue'
import XButton from '@/components/input/Button.vue'

// ─────────────────────────────────────────────────────────────
// We still use ProjectModel/Service, LabelModel/Service, and
// LabelTaskService for creating projects, labels, and label
// assignments — those work fine through the standard pipeline.
//
// HOWEVER, for TASK CREATION we bypass TaskModel + TaskService
// entirely and use raw fetch() calls.  This is the fix for the
// date-dropping bug.
//
// Root cause:  TaskModel defaults date fields to `0` (not null).
// The constructor chain — assignData() → objectToCamelCase →
// omitBy(isNil) → Object.assign → parseDateOrNull — either
// loses the Date objects or the beforeCreate() → processModel()
// → objectToSnakeCase double-transform corrupts them.  The
// server never sees the dates in the request body.
//
// By sending snake_case JSON directly via fetch(), we match the
// exact format that works from the browser console (verified in
// DevTools: PUT /api/v1/projects/{id}/tasks returns dates).
// ─────────────────────────────────────────────────────────────
import ProjectModel from '@/models/project'
import LabelModel from '@/models/label'
import LabelTask from '@/models/labelTask'

import ProjectService from '@/services/project'
import LabelService from '@/services/label'
import LabelTaskService from '@/services/labelTask'

// ── State ──
const fileInput = ref<HTMLInputElement | null>(null)
const isDragover = ref(false)
const parseError = ref('')

const boardData = ref<any>(null)
const isImporting = ref(false)
const importComplete = ref(false)
const createdProjectId = ref<number>(0)

const progressPercent = ref(0)
const progressText = ref('')
const importLog = ref<Array<{type: string, message: string}>>([])
const importStats = ref({ projects: 0, tasks: 0, labels: 0, errors: 0, datesSet: 0 })

// ── Options ──
const options = ref({
	projectName: '',
	listsAsSubProjects: true,
	importArchived: false,
	importClosedLists: false,
	importChecklists: true,
	importLabels: true,
	markDueCompleteAsDone: true,
})

const selectedListIds = ref<Set<string>>(new Set())

// ── Computed ──
const allLists = computed(() => {
	if (!boardData.value) return []
	const lists = boardData.value.lists || []
	if (options.value.importClosedLists) return lists
	return lists.filter((l: any) => !l.closed)
})

const openLists = computed(() => (boardData.value?.lists || []).filter((l: any) => !l.closed))
const openCards = computed(() => (boardData.value?.cards || []).filter((c: any) => !c.closed))
const boardLabels = computed(() => (boardData.value?.labels || []).filter((l: any) => l.name))
const boardChecklists = computed(() => boardData.value?.checklists || [])
const closedCardCount = computed(() => (boardData.value?.cards || []).filter((c: any) => c.closed).length)
const closedListCount = computed(() => (boardData.value?.lists || []).filter((l: any) => l.closed).length)

const totalSelectedCards = computed(() => {
	if (!boardData.value) return 0
	const cards = boardData.value.cards || []
	return cards.filter((c: any) => {
		if (!selectedListIds.value.has(c.idList)) return false
		if (!options.value.importArchived && c.closed) return false
		return true
	}).length
})

// ── File Handling ──
function handleDrop(e: DragEvent) {
	isDragover.value = false
	const file = e.dataTransfer?.files?.[0]
	if (file) parseFile(file)
}

function handleFileSelect(e: Event) {
	const file = (e.target as HTMLInputElement).files?.[0]
	if (file) parseFile(file)
}

function parseFile(file: File) {
	parseError.value = ''
	if (!file.name.endsWith('.json')) {
		parseError.value = 'Please upload a .json file exported from Trello.'
		return
	}

	const reader = new FileReader()
	reader.onload = (e) => {
		try {
			const data = JSON.parse(e.target?.result as string)
			if (!data.cards || !data.lists) {
				parseError.value = 'This doesn\'t look like a Trello board export. Expected "cards" and "lists" fields.'
				return
			}
			boardData.value = data
			options.value.projectName = data.name || 'Trello Import'

			// Auto-select open lists
			selectedListIds.value = new Set(
				(data.lists || [])
					.filter((l: any) => !l.closed)
					.map((l: any) => l.id)
			)
		} catch {
			parseError.value = 'Failed to parse JSON file. Make sure it\'s a valid Trello export.'
		}
	}
	reader.readAsText(file)
}

function getCardCount(listId: string): number {
	if (!boardData.value) return 0
	return (boardData.value.cards || []).filter((c: any) => c.idList === listId && !c.closed).length
}

function toggleList(listId: string) {
	const ids = new Set(selectedListIds.value)
	if (ids.has(listId)) {
		ids.delete(listId)
	} else {
		ids.add(listId)
	}
	selectedListIds.value = ids
}

function resetImport() {
	boardData.value = null
	isImporting.value = false
	importComplete.value = false
	importLog.value = []
	importStats.value = { projects: 0, tasks: 0, labels: 0, errors: 0, datesSet: 0 }
	progressPercent.value = 0
	progressText.value = ''
	parseError.value = ''
	if (fileInput.value) fileInput.value.value = ''
}

// ── Color Mapping ──
const TRELLO_COLORS: Record<string, string> = {
	green: '#61bd4f', green_dark: '#519839', green_light: '#b7ddb0',
	yellow: '#f2d600', yellow_dark: '#d9b51c', yellow_light: '#f5ea92',
	orange: '#ff9f1a', orange_dark: '#cd8313', orange_light: '#fad29c',
	red: '#eb5a46', red_dark: '#b04632', red_light: '#ef7564',
	purple: '#c377e0', purple_dark: '#89609e', purple_light: '#cd8de5',
	blue: '#0079bf', blue_dark: '#055a8c', blue_light: '#8bbdd9',
	sky: '#00c2e0', sky_dark: '#0098b7', sky_light: '#8fdfeb',
	lime: '#51e898', lime_dark: '#4bbf6b', lime_light: '#b3f1d0',
	pink: '#ff78cb', pink_dark: '#c9558f', pink_light: '#f7a4d0',
	black: '#344563', black_dark: '#091e42', black_light: '#505f79',
}

function trelloColorToHex(color: string): string {
	return TRELLO_COLORS[color] || '#838c91'
}

function trelloColorTextColor(color: string): string {
	const lightColors = ['yellow', 'yellow_light', 'green_light', 'orange_light', 'lime', 'lime_light', 'sky_light', 'pink_light', 'blue_light']
	return lightColors.includes(color) ? '#172b4d' : '#ffffff'
}

// ─────────────────────────────────────────────────────────────
// getAuthToken()
//
// Retrieve the JWT bearer token from localStorage.  Vikunja's
// frontend stores it under the key 'token'.  We need this for
// raw fetch() calls that bypass the axios interceptor chain.
// ─────────────────────────────────────────────────────────────
function getAuthToken(): string {
	return localStorage.getItem('token') || ''
}

// ─────────────────────────────────────────────────────────────
// createTaskRaw()
//
// Create a task via raw fetch() to /api/v1/projects/{id}/tasks.
// This bypasses TaskModel + TaskService entirely to avoid the
// date-dropping bug in the constructor/interceptor chain.
//
// The payload uses snake_case keys matching the Go API directly:
//   title, description, due_date, start_date, end_date, done,
//   project_id, bucket_id, position
//
// Returns the parsed JSON response (the created task object).
// ─────────────────────────────────────────────────────────────
async function createTaskRaw(projectId: number, payload: Record<string, any>): Promise<any> {
	const token = getAuthToken()
	const response = await fetch(`/api/v1/projects/${projectId}/tasks`, {
		method: 'PUT',
		headers: {
			'Authorization': 'Bearer ' + token,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(payload),
	})

	if (!response.ok) {
		const errBody = await response.text()
		throw new Error(`HTTP ${response.status}: ${errBody}`)
	}

	return response.json()
}

// ── Import Logic ──
async function startImport() {
	isImporting.value = true
	importLog.value = []
	importStats.value = { projects: 0, tasks: 0, labels: 0, errors: 0, datesSet: 0 }

	const projectService = new ProjectService()
	const labelService = new LabelService()
	const labelTaskService = new LabelTaskService()

	const board = boardData.value
	const selectedLists = (board.lists || []).filter((l: any) => selectedListIds.value.has(l.id))
	const cards = (board.cards || []).filter((c: any) => {
		if (!selectedListIds.value.has(c.idList)) return false
		if (!options.value.importArchived && c.closed) return false
		return true
	})

	// Total steps: 1 (parent project) + labels + lists + cards
	const totalSteps = 1 + (options.value.importLabels ? boardLabels.value.length : 0) + selectedLists.length + cards.length
	let currentStep = 0

	function updateProgress(text: string) {
		currentStep++
		progressPercent.value = Math.min(Math.round((currentStep / totalSteps) * 100), 99)
		progressText.value = text
	}

	function log(type: string, message: string) {
		importLog.value.push({ type, message })
	}

	try {
		// ─────────────────────────────────────────────────────
		// PHASE 1: Create parent project
		// ─────────────────────────────────────────────────────
		updateProgress('Creating project...')
		log('info', `Creating project "${options.value.projectName}"`)
		const parentProject = await projectService.create(new ProjectModel({
			title: options.value.projectName,
			description: board.desc || '',
		}))
		createdProjectId.value = parentProject.id
		importStats.value.projects++

		// ─────────────────────────────────────────────────────
		// PHASE 2: Create labels
		// Map Trello label ID → Vikunja label ID so we can
		// assign them to tasks after creation.
		// ─────────────────────────────────────────────────────
		const labelMap = new Map<string, number>()
		if (options.value.importLabels) {
			for (const trelloLabel of boardLabels.value) {
				updateProgress(`Creating label "${trelloLabel.name}"...`)
				try {
					const label = await labelService.create(new LabelModel({
						title: trelloLabel.name,
						hexColor: trelloColorToHex(trelloLabel.color),
					}))
					labelMap.set(trelloLabel.id, label.id)
					importStats.value.labels++
					log('success', `Label: ${trelloLabel.name}`)
				} catch (e: any) {
					// Label might already exist — search and reuse
					try {
						const existing = await labelService.getAll({}, {s: trelloLabel.name})
						const match = existing.find((l: any) => l.title === trelloLabel.name)
						if (match) {
							labelMap.set(trelloLabel.id, match.id)
							log('info', `Label "${trelloLabel.name}" already exists, reusing`)
						} else {
							throw e
						}
					} catch {
						log('error', `Failed to create label "${trelloLabel.name}": ${e?.message || e}`)
						importStats.value.errors++
					}
				}
			}
		}

		// ─────────────────────────────────────────────────────
		// PHASE 3: Create sub-projects for each Trello list
		// Maps Trello list ID → Vikunja project ID.
		// ─────────────────────────────────────────────────────
		const listProjectMap = new Map<string, number>()
		if (options.value.listsAsSubProjects) {
			for (const list of selectedLists) {
				updateProgress(`Creating list "${list.name}"...`)
				try {
					const subProject = await projectService.create(new ProjectModel({
						title: list.name,
						parentProjectId: parentProject.id,
						isArchived: list.closed || false,
					}))
					listProjectMap.set(list.id, subProject.id)
					importStats.value.projects++
					log('success', `Sub-project: ${list.name}`)
				} catch (e: any) {
					log('error', `Failed to create sub-project "${list.name}": ${e?.message || e}`)
					importStats.value.errors++
					// Fall back to parent project
					listProjectMap.set(list.id, parentProject.id)
				}
			}
		} else {
			// All lists go into parent project
			for (const list of selectedLists) {
				listProjectMap.set(list.id, parentProject.id)
			}
		}

		// ─────────────────────────────────────────────────────
		// PHASE 4: Build checklist lookup
		// Trello checklists are separate objects referencing
		// the card by idCard.  Group them for fast lookup.
		// ─────────────────────────────────────────────────────
		const checklistMap = new Map<string, any[]>()
		if (options.value.importChecklists) {
			for (const cl of (board.checklists || [])) {
				const existing = checklistMap.get(cl.idCard) || []
				existing.push(cl)
				checklistMap.set(cl.idCard, existing)
			}
		}

		// ─────────────────────────────────────────────────────
		// PHASE 5: Import cards as tasks
		//
		// KEY FIX: We use createTaskRaw() — a direct fetch()
		// to the Vikunja API — instead of going through
		// TaskModel + TaskService.  This ensures date fields
		// (due_date, start_date, end_date) arrive at the
		// server in the exact snake_case ISO format it expects.
		//
		// The TaskModel constructor pipeline was dropping dates
		// because of its `0` defaults + the parseDateOrNull /
		// objectToSnakeCase double-transform chain.
		// ─────────────────────────────────────────────────────
		const sortedCards = [...cards].sort((a: any, b: any) => (a.pos || 0) - (b.pos || 0))

		for (const card of sortedCards) {
			const projectId = listProjectMap.get(card.idList) || parentProject.id
			updateProgress(`Importing "${card.name?.substring(0, 40)}..."`)

			try {
				// ── Build description ──
				let description = card.desc || ''

				// Append checklists as markdown
				const cardChecklists = checklistMap.get(card.id) || []
				if (cardChecklists.length > 0 && options.value.importChecklists) {
					if (description) description += '\n\n'
					for (const cl of cardChecklists) {
						description += `### ${cl.name}\n`
						const items = (cl.checkItems || []).sort((a: any, b: any) => (a.pos || 0) - (b.pos || 0))
						for (const item of items) {
							const checked = item.state === 'complete' ? 'x' : ' '
							description += `- [${checked}] ${item.name}\n`
						}
						description += '\n'
					}
				}

				// Append attachment links
				if (card.attachments && card.attachments.length > 0) {
					if (description) description += '\n\n'
					description += '### Attachments\n'
					for (const att of card.attachments) {
						const name = att.name || att.fileName || 'attachment'
						description += `- [${name}](${att.url})\n`
					}
				}

				// ── Build the snake_case payload for the API ──
				// This goes directly to PUT /api/v1/projects/{id}/tasks
				// without any TaskModel constructor or service interceptor.
				const payload: Record<string, any> = {
					title: card.name,
					description: description.trim(),
					done: false,
				}

				// ── Date mapping ──
				// Trello card.due and card.start are ISO 8601 strings
				// like "2025-10-28T00:00:00.000Z".  We convert to Date
				// then back to ISO to normalize, and send as snake_case.
				//
				// When a card has only a due date (no start), we set
				// due_date + end_date but NOT start_date.  This lets the
				// gantt chart render it with the "endOnly" fade-in style
				// instead of a misleading single-day bar.
				let hasAnyDate = false

				if (card.due) {
					payload.due_date = new Date(card.due).toISOString()
					hasAnyDate = true
				}

				if (card.start && card.due) {
					// Card has both start and due → full gantt bar range
					payload.start_date = new Date(card.start).toISOString()
					payload.end_date = new Date(card.due).toISOString()
				} else if (card.start && !card.due) {
					// Start only → set both start and end to start date
					payload.start_date = new Date(card.start).toISOString()
					payload.end_date = new Date(card.start).toISOString()
				} else if (!card.start && card.due) {
					// Due only → end_date = due, no start_date
					// Gantt will render as "endOnly" with fade-in effect
					payload.end_date = new Date(card.due).toISOString()
				}

				if (card.start) hasAnyDate = true

				// ── Done status ──
				if (card.closed) {
					payload.done = true
				} else if (options.value.markDueCompleteAsDone && card.dueComplete) {
					payload.done = true
				}

				// ── Create the task via raw fetch ──
				const task = await createTaskRaw(projectId, payload)

				// Track date stats
				if (hasAnyDate) {
					importStats.value.datesSet++
				}

				// ── Assign labels ──
				// Label assignment still uses the standard service
				// since it doesn't have the same date issue.
				if (options.value.importLabels && card.idLabels?.length > 0) {
					for (const trelloLabelId of card.idLabels) {
						const vikunjaLabelId = labelMap.get(trelloLabelId)
						if (vikunjaLabelId) {
							try {
								await labelTaskService.create(new LabelTask({
									taskId: task.id,
									labelId: vikunjaLabelId,
								}))
							} catch {
								// Label assignment might fail silently (duplicate, etc.)
							}
						}
					}
				}

				importStats.value.tasks++
			} catch (e: any) {
				log('error', `Failed to import card "${card.name}": ${e?.message || e}`)
				importStats.value.errors++
			}
		}

		// ─────────────────────────────────────────────────────
		// PHASE 6: Refresh and finish
		// ─────────────────────────────────────────────────────
		const projectStore = useProjectStore()
		await projectStore.loadAllProjects()

		progressPercent.value = 100
		log('success', `Import complete! ${importStats.value.tasks} tasks across ${importStats.value.projects} projects (${importStats.value.datesSet} with dates).`)

	} catch (e: any) {
		log('error', `Import failed: ${e?.message || e}`)
		importStats.value.errors++
	} finally {
		isImporting.value = false
		importComplete.value = true
	}
}
</script>

<style lang="scss" scoped>
.upload-section {
	max-inline-size: 600px;
	margin: 2rem auto;
}

.upload-dropzone {
	border: 2px dashed var(--grey-400);
	border-radius: 12px;
	padding: 3rem 2rem;
	text-align: center;
	cursor: pointer;
	transition: all 200ms ease;
	background: var(--grey-100);

	&:hover,
	&.is-dragover {
		border-color: var(--primary);
		background: var(--primary-light);
	}
}

.upload-icon {
	font-size: 2.5rem;
	color: var(--grey-500);
	margin-block-end: 1rem;
}

.upload-text {
	font-size: 1.1rem;
	font-weight: 600;
	margin-block-end: 0.5rem;
}

.upload-hint {
	font-size: 0.85rem;
	color: var(--grey-500);
}

// Preview
.board-header {
	margin-block-end: 1.5rem;
	padding-block-end: 1rem;
	border-block-end: 1px solid var(--grey-200);
}

.board-desc {
	color: var(--grey-500);
	margin-block-end: 0.5rem;
}

.board-stats {
	display: flex;
	gap: 1.5rem;
	flex-wrap: wrap;
}

.stat {
	color: var(--grey-500);
	font-size: 0.9rem;

	strong {
		color: var(--text);
	}
}

// Options
.import-options {
	margin-block-end: 1.5rem;

	h3 {
		margin-block-end: 0.75rem;
	}
}

.option-row {
	padding: 0.5rem 0;

	label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}

	input[type="checkbox"] {
		flex-shrink: 0;
	}

	input[type="text"] {
		max-inline-size: 400px;
	}
}

.option-desc {
	display: block;
	font-size: 0.8rem;
	color: var(--grey-500);
	padding-inline-start: 1.5rem;
}

// Lists
.list-selection {
	margin-block-end: 1.5rem;

	h3 {
		margin-block-end: 0.75rem;
	}
}

.list-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
	gap: 0.5rem;
}

.list-item {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.6rem 0.8rem;
	border-radius: 8px;
	background: var(--grey-100);
	cursor: pointer;
	transition: all 150ms ease;

	&:hover {
		background: var(--grey-200);
	}

	&.is-selected {
		background: var(--primary-light);
		border: 1px solid var(--primary);
	}

	&.is-closed {
		opacity: 0.6;
	}
}

.list-name {
	flex: 1;
	font-weight: 500;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.list-count {
	font-size: 0.8rem;
	color: var(--grey-500);
	white-space: nowrap;
}

.list-badge {
	font-size: 0.7rem;
	padding: 0.1rem 0.4rem;
	border-radius: 4px;
	background: var(--grey-400);
	color: white;
}

// Labels
.label-preview {
	margin-block-end: 1.5rem;

	h3 {
		margin-block-end: 0.75rem;
	}
}

.label-chips {
	display: flex;
	flex-wrap: wrap;
	gap: 0.4rem;
}

.label-chip {
	padding: 0.25rem 0.6rem;
	border-radius: 4px;
	font-size: 0.8rem;
	font-weight: 600;
}

// Progress
.progress-section {
	max-inline-size: 600px;
	margin: 2rem auto;
	text-align: center;
}

.progress-bar-container {
	block-size: 8px;
	background: var(--grey-200);
	border-radius: 4px;
	overflow: hidden;
	margin-block: 1rem;
}

.progress-bar {
	block-size: 100%;
	background: var(--primary);
	border-radius: 4px;
	transition: width 300ms ease;
}

.progress-text {
	font-size: 0.9rem;
	color: var(--grey-500);
}

// Log
.import-log {
	margin-block-start: 1.5rem;
	max-block-size: 300px;
	overflow-y: auto;
	background: var(--grey-100);
	border-radius: 8px;
	padding: 0.75rem;
	font-family: monospace;
	font-size: 0.8rem;
	text-align: start;

	&.is-complete {
		max-block-size: 400px;
	}
}

.log-entry {
	padding: 0.2rem 0;

	&.success {
		color: var(--success);
	}

	&.error {
		color: var(--danger);
	}

	&.info {
		color: var(--grey-500);
	}
}

// Complete
.complete-section {
	text-align: center;
	max-inline-size: 600px;
	margin: 2rem auto;
}

.complete-icon {
	font-size: 3rem;
	inline-size: 80px;
	block-size: 80px;
	line-height: 80px;
	border-radius: 50%;
	background: var(--success);
	color: white;
	margin: 0 auto 1rem;
}

.complete-stats {
	display: flex;
	justify-content: center;
	gap: 2rem;
	margin-block: 1.5rem;
}

.complete-stat {
	text-align: center;

	strong {
		display: block;
		font-size: 2rem;
	}

	span {
		font-size: 0.85rem;
		color: var(--grey-500);
	}
}

.complete-errors {
	margin-block-end: 1rem;
}

// Action buttons
.action-buttons {
	display: flex;
	gap: 0.75rem;
	margin-block-start: 1.5rem;
}
</style>
