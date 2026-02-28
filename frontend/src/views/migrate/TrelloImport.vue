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
					<span v-if="boardMembers.length" class="stat"><strong>{{ boardMembers.length }}</strong> members</span>
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

				<div class="option-group">
					<h4 class="option-group-title">Kanban Board Layout</h4>
					<div class="radio-options">
						<label class="radio-option" :class="{ 'is-selected': options.kanbanMode === 'simple' }">
							<input v-model="options.kanbanMode" type="radio" value="simple" name="kanbanMode">
							<div class="radio-content">
								<span class="radio-title">Simple (To-Do / Done)</span>
								<span class="radio-desc">Tasks go to sub-projects. Unfinished → "To-Do" bucket, completed → "Done" on each sub-project's Kanban.</span>
							</div>
						</label>
						<label class="radio-option" :class="{ 'is-selected': options.kanbanMode === 'replicate' }">
							<input v-model="options.kanbanMode" type="radio" value="replicate" name="kanbanMode">
							<div class="radio-content">
								<span class="radio-title">Replicate Trello Board</span>
								<span class="radio-desc">1:1 Trello emulation — all tasks in one project with Kanban columns matching your Trello lists. No sub-projects created.</span>
							</div>
						</label>
						<label class="radio-option" :class="{ 'is-selected': options.kanbanMode === 'none' }">
							<input v-model="options.kanbanMode" type="radio" value="none" name="kanbanMode">
							<div class="radio-content">
								<span class="radio-title">Skip Kanban setup</span>
								<span class="radio-desc">Don't assign tasks to Kanban buckets (tasks visible in List, Table, Gantt only)</span>
							</div>
						</label>
					</div>
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
						<input v-model="options.importComments" type="checkbox">
						<span>Import comments</span>
					</label>
					<span class="option-desc">{{ boardCommentCount }} comments found</span>
				</div>

				<div v-if="boardMembers.length > 0" class="option-row">
					<label class="option-label">
						<input v-model="options.importMembers" type="checkbox">
						<span>Import card members as labels + description note</span>
					</label>
					<span class="option-desc">{{ boardMembers.length }} members found — creates labels for assigned members</span>
				</div>

				<div class="option-row">
					<label class="option-label">
						<input v-model="options.markDueCompleteAsDone" type="checkbox">
						<span>Mark cards with completed due dates as done</span>
					</label>
				</div>

				<!-- Trello API Connection (optional) -->
				<div class="trello-api-section">
					<button
						type="button"
						class="trello-api-toggle"
						@click="showTrelloApi = !showTrelloApi"
					>
						<Icon :icon="showTrelloApi ? 'chevron-down' : 'chevron-right'" />
						<span>Connect Trello API</span>
						<span class="trello-api-badge" v-if="trelloApiValid === true">✓ Connected</span>
						<span class="trello-api-badge is-optional" v-else>Optional</span>
					</button>
					<div v-if="showTrelloApi" class="trello-api-fields">
						<p class="trello-api-desc">
							Provide your Trello API key and token to unlock enhanced import:
							<strong>all comments</strong> (JSON export caps at 1,000 total actions) and
							<strong>attachment downloads</strong> (files are re-uploaded to Vikunja).
						</p>
						<p class="trello-api-desc">
							Get credentials at
							<a href="https://trello.com/power-ups/admin" target="_blank" rel="noopener">trello.com/power-ups/admin</a>
							→ your Power-Up → API Key tab. Then click the Token link to generate a read-only token.
						</p>
						<div class="trello-api-inputs">
							<input
								v-model="trelloApiKey"
								type="text"
								class="input"
								placeholder="API Key (32 chars)"
								autocomplete="off"
							>
							<input
								v-model="trelloApiToken"
								type="password"
								class="input"
								placeholder="API Token (64 chars)"
								autocomplete="off"
							>
							<button
								type="button"
								class="button is-small"
								:disabled="!hasTrelloApi || trelloApiTesting"
								@click="testTrelloApi"
							>
								{{ trelloApiTesting ? 'Testing...' : 'Test Connection' }}
							</button>
						</div>
						<div v-if="trelloApiValid === true" class="trello-api-status is-success">
							✓ API connection verified. All comments and attachments will be imported via API.
						</div>
						<div v-if="trelloApiValid === false" class="trello-api-status is-error">
							✗ Connection failed. Check your key and token. Import will use JSON data only.
						</div>
					</div>
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
					v-for="(entry, i) in importLog.slice(-20)"
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
				<div class="complete-stat" v-if="importStats.doneCount > 0">
					<strong>{{ importStats.doneCount }}</strong>
					<span>marked done</span>
				</div>
				<div class="complete-stat" v-if="importStats.buckets > 0">
					<strong>{{ importStats.buckets }}</strong>
					<span>kanban {{ importStats.buckets === 1 ? 'column' : 'columns' }}</span>
				</div>
				<div class="complete-stat" v-if="importStats.comments > 0">
					<strong>{{ importStats.comments }}</strong>
					<span>{{ importStats.comments === 1 ? 'comment' : 'comments' }}</span>
				</div>
				<div class="complete-stat" v-if="importStats.attachments > 0">
					<strong>{{ importStats.attachments }}</strong>
					<span>{{ importStats.attachments === 1 ? 'attachment' : 'attachments' }}</span>
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
				<div class="log-header">
					<h3>Import Log</h3>
					<div class="log-actions">
						<button class="log-btn" @click="copyLog" :title="logCopied ? 'Copied!' : 'Copy to clipboard'">
							{{ logCopied ? '✓ Copied' : '📋 Copy' }}
						</button>
						<button class="log-btn" @click="downloadLog" title="Download as text file">
							💾 Download
						</button>
					</div>
				</div>
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
const importStats = ref({ projects: 0, tasks: 0, labels: 0, errors: 0, datesSet: 0, buckets: 0, doneCount: 0, comments: 0, attachments: 0 })

// ── Options ──
const options = ref({
	projectName: '',
	listsAsSubProjects: true,
	kanbanMode: 'simple' as 'simple' | 'replicate' | 'none',
	importArchived: false,
	importClosedLists: false,
	importChecklists: true,
	importLabels: true,
	importComments: true,
	importMembers: true,
	markDueCompleteAsDone: true,
})

// ── Trello API credentials (optional, for enhanced import) ──
const trelloApiKey = ref('')
const trelloApiToken = ref('')
const showTrelloApi = ref(false)
const trelloApiValid = ref<boolean | null>(null)  // null=untested, true=valid, false=invalid
const trelloApiTesting = ref(false)

const hasTrelloApi = computed(() => trelloApiKey.value.length >= 32 && trelloApiToken.value.length >= 32)

async function testTrelloApi() {
	if (!hasTrelloApi.value) return
	trelloApiTesting.value = true
	trelloApiValid.value = null
	try {
		const resp = await fetch(`https://api.trello.com/1/members/me?key=${trelloApiKey.value}&token=${trelloApiToken.value}`)
		trelloApiValid.value = resp.ok
	} catch {
		trelloApiValid.value = false
	}
	trelloApiTesting.value = false
}

const selectedListIds = ref<Set<string>>(new Set())
const logCopied = ref(false)

// ── Log export helpers ──
function getLogText(): string {
	const header = `Trello Import Log — ${new Date().toISOString()}\n` +
		`Project: ${options.value.projectName}\n` +
		`Tasks: ${importStats.value.tasks} | Labels: ${importStats.value.labels} | ` +
		`Dates: ${importStats.value.datesSet} | Done: ${importStats.value.doneCount} | ` +
		`Buckets: ${importStats.value.buckets} | Comments: ${importStats.value.comments} | Attachments: ${importStats.value.attachments} | Errors: ${importStats.value.errors}\n` +
		'─'.repeat(60) + '\n'
	return header + importLog.value.map(e => `[${e.type.toUpperCase()}] ${e.message}`).join('\n')
}

function copyLog() {
	const text = getLogText()
	// Use textarea fallback for broad compat (works over HTTP too)
	const ta = document.createElement('textarea')
	ta.value = text
	ta.style.position = 'fixed'
	ta.style.opacity = '0'
	document.body.appendChild(ta)
	ta.focus()
	ta.select()
	document.execCommand('copy')
	document.body.removeChild(ta)
	logCopied.value = true
	setTimeout(() => { logCopied.value = false }, 2000)
}

function downloadLog() {
	const text = getLogText()
	const blob = new Blob([text], { type: 'text/plain' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = `trello-import-${Date.now()}.log`
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)
}

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
const boardMembers = computed(() => boardData.value?.members || [])
const boardCommentCount = computed(() => {
	const actions = boardData.value?.actions || []
	return actions.filter((a: any) => a.type === 'commentCard').length
})
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
	importStats.value = { projects: 0, tasks: 0, labels: 0, errors: 0, datesSet: 0, buckets: 0, doneCount: 0, comments: 0, attachments: 0 }
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

// ─────────────────────────────────────────────────────────────
// createCommentRaw()
//
// Create a comment on a task via PUT /api/v1/tasks/{id}/comments.
// Trello comments include author and date — we prepend a header
// line with the original author name and timestamp so the
// context is preserved even though Vikunja assigns the comment
// to the importing user.
// ─────────────────────────────────────────────────────────────
async function createCommentRaw(taskId: number, comment: string): Promise<any> {
	const token = getAuthToken()
	const response = await fetch(`/api/v1/tasks/${taskId}/comments`, {
		method: 'PUT',
		headers: {
			'Authorization': 'Bearer ' + token,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ comment }),
	})

	if (!response.ok) {
		const errBody = await response.text()
		throw new Error(`HTTP ${response.status}: ${errBody}`)
	}

	return response.json()
}
// ─────────────────────────────────────────────────────────────
// Trello API helpers (used when API key + token are provided)
// ─────────────────────────────────────────────────────────────

// Fetch ALL comment actions for a board via paginated API calls.
// Returns a Map<cardId, action[]> just like the JSON-based commentMap.
async function fetchAllCommentsViaApi(boardId: string, apiKey: string, apiToken: string, logFn: (type: string, msg: string) => void): Promise<Map<string, any[]>> {
	const commentMap = new Map<string, any[]>()
	let before: string | null = null
	let totalFetched = 0
	const maxPages = 50  // safety limit

	for (let page = 0; page < maxPages; page++) {
		let url = `https://api.trello.com/1/boards/${boardId}/actions?filter=commentCard&limit=1000&key=${apiKey}&token=${apiToken}`
		if (before) url += `&before=${before}`

		const resp = await fetch(url)
		if (!resp.ok) {
			logFn('error', `Trello API error fetching comments: HTTP ${resp.status}`)
			break
		}

		const actions: any[] = await resp.json()
		if (actions.length === 0) break

		for (const action of actions) {
			if (action.data?.card?.id && action.data?.text) {
				const cardId = action.data.card.id
				const existing = commentMap.get(cardId) || []
				existing.push(action)
				commentMap.set(cardId, existing)
			}
		}

		totalFetched += actions.length
		// Paginate using the ID of the last action
		before = actions[actions.length - 1].id

		if (actions.length < 1000) break  // no more pages
	}

	// Sort chronologically within each card
	for (const [, comments] of commentMap) {
		comments.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
	}

	if (totalFetched > 0) {
		logFn('info', `Trello API: fetched ${totalFetched} comments across ${commentMap.size} cards`)
	}

	return commentMap
}

// Download an attachment from Trello and upload it to a Vikunja task.
// Returns the Vikunja attachment object (with id, file info) or null on failure.
async function downloadAndUploadAttachment(
	trelloCardId: string,
	attachment: any,
	vikunjaTaskId: number,
	apiKey: string,
	apiToken: string,
): Promise<any | null> {
	const downloadUrl = `https://api.trello.com/1/cards/${trelloCardId}/attachments/${attachment.id}/download/${encodeURIComponent(attachment.name || 'file')}`

	// Download from Trello via backend proxy (avoids CORS)
	const proxyResp = await fetch('/api/v1/trello/proxy-download', {
		method: 'POST',
		headers: {
			'Authorization': 'Bearer ' + getAuthToken(),
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			url: downloadUrl,
			key: apiKey,
			token: apiToken,
		}),
	})

	if (!proxyResp.ok) {
		const errText = await proxyResp.text().catch(() => '(no body)')
		console.error(`[Attachment] Proxy download failed ${proxyResp.status}: ${errText}`)
		console.error(`[Attachment] URL was: ${downloadUrl}`)
		return null
	}

	const blob = await proxyResp.blob()
	console.log(`[Attachment] Downloaded ${blob.size} bytes, type=${blob.type}`)
	if (blob.size === 0) {
		console.error('[Attachment] Empty blob returned from proxy')
		return null
	}

	const fileName = attachment.name || attachment.fileName || 'attachment'

	// Upload to Vikunja
	const vikunjaToken = getAuthToken()
	const formData = new FormData()
	formData.append('files', new File([blob], fileName, { type: attachment.mimeType || blob.type || 'application/octet-stream' }))

	const uploadResp = await fetch(`/api/v1/tasks/${vikunjaTaskId}/attachments`, {
		method: 'PUT',
		headers: {
			'Authorization': 'Bearer ' + vikunjaToken,
		},
		body: formData,
	})

	if (!uploadResp.ok) {
		const errText = await uploadResp.text().catch(() => '(no body)')
		console.error(`[Attachment] Vikunja upload failed ${uploadResp.status}: ${errText}`)
		return null
	}

	const result = await uploadResp.json()
	console.log('[Attachment] Upload result:', JSON.stringify(result))
	// Vikunja returns { success: [{ id, ... }] }
	if (result?.success?.length > 0) return result.success[0]
	if (result?.success?.id) return result.success
	return null
}
// Vikunja 1.0+ stores buckets per-VIEW, not per-project.  When
// a project is created it auto-creates views including a Kanban
// view with default buckets (To-Do, Doing, Done).
//
// Three modes:
//   'simple'    → assign unfinished→To-Do, done→Done
//   'replicate' → create buckets matching Trello lists on the
//                  parent project's Kanban, assign cards to their
//                  original list's bucket
//   'none'      → skip bucket assignment entirely
// ─────────────────────────────────────────────────────────────

interface BucketInfo {
	id: number
	title: string
	position: number
}

async function getProjectKanbanViewId(projectId: number): Promise<number | null> {
	const token = getAuthToken()
	try {
		const resp = await fetch(`/api/v1/projects/${projectId}/views`, {
			headers: { 'Authorization': 'Bearer ' + token },
		})
		if (!resp.ok) return null
		const views: any[] = await resp.json()
		// Find the Kanban view.  Vikunja uses view_kind === 3 for Kanban.
		// Check both snake_case and camelCase, plus title fallback.
		const kanban = views.find((v: any) =>
			v.view_kind === 3 || v.viewKind === 3 ||
			(v.title || '').toLowerCase() === 'kanban'
		)
		return kanban?.id ?? null
	} catch {
		return null
	}
}

async function getBucketsByView(projectId: number, viewId: number): Promise<BucketInfo[]> {
	const token = getAuthToken()
	try {
		const resp = await fetch(`/api/v1/projects/${projectId}/views/${viewId}/buckets`, {
			headers: { 'Authorization': 'Bearer ' + token },
		})
		if (!resp.ok) return []
		const buckets: any[] = await resp.json()
		return buckets
			.map((b: any) => ({ id: b.id, title: b.title || '', position: b.position || 0 }))
			.sort((a, b) => a.position - b.position)
	} catch {
		return []
	}
}

async function createBucketRaw(projectId: number, viewId: number, title: string, position: number): Promise<number | null> {
	const token = getAuthToken()
	try {
		const resp = await fetch(`/api/v1/projects/${projectId}/views/${viewId}/buckets`, {
			method: 'PUT',
			headers: {
				'Authorization': 'Bearer ' + token,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ title, position }),
		})
		if (!resp.ok) {
			const errBody = await resp.text()
			console.error(`createBucket failed: HTTP ${resp.status}`, errBody)
			return null
		}
		const bucket = await resp.json()
		return bucket?.id ?? null
	} catch (e) {
		console.error('createBucket exception:', e)
		return null
	}
}

async function deleteBucketRaw(projectId: number, viewId: number, bucketId: number): Promise<void> {
	const token = getAuthToken()
	try {
		await fetch(`/api/v1/projects/${projectId}/views/${viewId}/buckets/${bucketId}`, {
			method: 'DELETE',
			headers: { 'Authorization': 'Bearer ' + token },
		})
	} catch {
		// non-fatal
	}
}

async function assignTaskToBucket(projectId: number, viewId: number, bucketId: number, taskId: number): Promise<void> {
	const token = getAuthToken()
	const resp = await fetch(`/api/v1/projects/${projectId}/views/${viewId}/buckets/${bucketId}/tasks`, {
		method: 'POST',
		headers: {
			'Authorization': 'Bearer ' + token,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ task_id: taskId }),
	})
	if (!resp.ok) {
		const errBody = await resp.text()
		throw new Error(`Bucket assign HTTP ${resp.status}: ${errBody}`)
	}
}

// ── Import Logic ──
async function startImport() {
	isImporting.value = true
	importLog.value = []
	importStats.value = { projects: 0, tasks: 0, labels: 0, errors: 0, datesSet: 0, buckets: 0, doneCount: 0, comments: 0, attachments: 0 }

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
		// PHASE 2b: Create member labels
		// Build a map of Trello member ID → Vikunja label ID.
		// Only creates labels for members actually assigned to
		// cards in the selected lists.  Collision avoidance:
		// reuse existing labels by exact title match.
		// ─────────────────────────────────────────────────────
		const memberLabelMap = new Map<string, number>()
		const memberNameMap = new Map<string, string>()  // memberId → display name
		if (options.value.importMembers && boardMembers.value.length > 0) {
			// Build name lookup
			for (const m of boardMembers.value) {
				memberNameMap.set(m.id, m.fullName || m.username || m.id)
			}

			// Find which members are actually used on selected cards
			const usedMemberIds = new Set<string>()
			const cards = board.cards || []
			for (const card of cards) {
				if (!selectedListIds.value.has(card.idList)) continue
				if (!options.value.importArchived && card.closed) continue
				for (const mid of (card.idMembers || [])) {
					usedMemberIds.add(mid)
				}
			}

			// Pre-fetch all existing labels once for collision check
			let existingLabels: any[] = []
			try {
				existingLabels = await labelService.getAll({}, {s: ''})
			} catch {
				// If fetch fails, we'll just create and handle duplicates
			}
			const existingLabelsByTitle = new Map<string, any>()
			for (const l of existingLabels) {
				existingLabelsByTitle.set(l.title.toLowerCase(), l)
			}

			// Also include labels we just created in this import
			for (const [trelloId, vikunjaId] of labelMap) {
				const trelloLabel = boardLabels.value.find((l: any) => l.id === trelloId)
				if (trelloLabel) {
					existingLabelsByTitle.set(trelloLabel.name.toLowerCase(), { id: vikunjaId, title: trelloLabel.name })
				}
			}

			for (const memberId of usedMemberIds) {
				const name = memberNameMap.get(memberId) || memberId
				const labelTitle = name
				updateProgress(`Creating member label "${labelTitle}"...`)

				// Check collision: exact match (case-insensitive)
				const existing = existingLabelsByTitle.get(labelTitle.toLowerCase())
				if (existing) {
					memberLabelMap.set(memberId, existing.id)
					log('info', `Member label "${labelTitle}" already exists (id=${existing.id}), reusing`)
					continue
				}

				try {
					const label = await labelService.create(new LabelModel({
						title: labelTitle,
						hexColor: '#b8b8b8',
					}))
					memberLabelMap.set(memberId, label.id)
					existingLabelsByTitle.set(labelTitle.toLowerCase(), label)
					log('success', `Member label: ${labelTitle}`)
				} catch (e: any) {
					// Last resort: search by name
					try {
						const results = await labelService.getAll({}, {s: labelTitle})
						const match = results.find((l: any) => l.title.toLowerCase() === labelTitle.toLowerCase())
						if (match) {
							memberLabelMap.set(memberId, match.id)
							log('info', `Member label "${labelTitle}" found via search, reusing`)
						} else {
							log('error', `Failed to create member label "${labelTitle}": ${e?.message || e}`)
						}
					} catch {
						log('error', `Failed to create member label "${labelTitle}": ${e?.message || e}`)
					}
				}
			}
		}

		// ─────────────────────────────────────────────────────
		// PHASE 3: Create sub-projects for each Trello list
		// Maps Trello list ID → Vikunja project ID.
		//
		// In 'replicate' kanban mode, we skip sub-projects
		// entirely — all tasks go directly into the parent
		// project so they appear on the parent Kanban board.
		// ─────────────────────────────────────────────────────
		const listProjectMap = new Map<string, number>()
		if (options.value.kanbanMode === 'replicate') {
			// Replicate mode: everything in parent project, no sub-projects
			for (const list of selectedLists) {
				listProjectMap.set(list.id, parentProject.id)
			}
			log('info', 'Replicate mode: all tasks will be created in parent project')
		} else if (options.value.listsAsSubProjects) {
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
		// PHASE 3.5: Set up Kanban buckets
		//
		// Three modes controlled by options.kanbanMode:
		//
		// 'simple' — For each project (parent + subs), find
		//   the default To-Do and Done buckets.  Tasks will be
		//   assigned based on their completion status.
		//
		// 'replicate' — 1:1 Trello emulation.  No sub-projects.
		//   On the parent project's Kanban view, replace the
		//   default buckets with one per Trello list.  Cards go
		//   directly into their original list's column.
		//
		// 'none' — Skip all bucket assignment.
		// ─────────────────────────────────────────────────────

		// Maps projectId → { viewId, todoBucketId, doneBucketId }
		const projectKanbanSimple = new Map<number, { viewId: number; todoBucketId: number; doneBucketId: number }>()

		// Maps trelloListId → bucketId (for 'replicate' mode on parent project)
		const trelloListBucketMap = new Map<string, number>()
		let parentKanbanViewId: number | null = null

		if (options.value.kanbanMode !== 'none') {
			// ── Simple mode: discover Kanban info for all target projects ──
			if (options.value.kanbanMode === 'simple') {
				const allProjectIds = new Set<number>()
				for (const pid of listProjectMap.values()) {
					allProjectIds.add(pid)
				}
				allProjectIds.add(parentProject.id)

				for (const pid of allProjectIds) {
					const kanbanViewId = await getProjectKanbanViewId(pid)
					if (!kanbanViewId) continue
					const buckets = await getBucketsByView(pid, kanbanViewId)
					if (buckets.length === 0) continue

					const todoBucket = buckets[0]
					const doneBucket = buckets.find(b =>
						b.title.toLowerCase() === 'done'
					) || buckets[buckets.length - 1]

					projectKanbanSimple.set(pid, {
						viewId: kanbanViewId,
						todoBucketId: todoBucket.id,
						doneBucketId: doneBucket.id,
					})
					log('info', `Kanban ready for project ${pid} — To-Do: "${todoBucket.title}", Done: "${doneBucket.title}"`)
				}
			}

			// ── Replicate mode: set up parent project Kanban ──
			if (options.value.kanbanMode === 'replicate') {
				parentKanbanViewId = await getProjectKanbanViewId(parentProject.id)
				if (parentKanbanViewId) {
					log('info', 'Setting up Trello-replica Kanban on parent project...')

					// Get existing default buckets so we can remove them after
					const existingBuckets = await getBucketsByView(parentProject.id, parentKanbanViewId)

					// Create a bucket for each selected Trello list (in original order)
					const orderedLists = [...selectedLists].sort((a: any, b: any) => (a.pos || 0) - (b.pos || 0))
					let bucketPos = 100

					for (const list of orderedLists) {
						updateProgress(`Creating Kanban column "${list.name}"...`)
						const bucketId = await createBucketRaw(parentProject.id, parentKanbanViewId, list.name, bucketPos)
						if (bucketId) {
							trelloListBucketMap.set(list.id, bucketId)
							importStats.value.buckets++
							log('success', `Kanban column: ${list.name} (listId=${list.id}, bucketId=${bucketId})`)
						} else {
							log('error', `Failed to create Kanban column "${list.name}"`)
							importStats.value.errors++
						}
						bucketPos += 100
					}

					// Remove the default buckets (To-Do, Doing, Done) since we've replaced them.
					if (trelloListBucketMap.size > 0) {
						for (const oldBucket of existingBuckets) {
							await deleteBucketRaw(parentProject.id, parentKanbanViewId, oldBucket.id)
							log('info', `Removed default bucket "${oldBucket.title}"`)
						}
					}
				} else {
					log('error', 'Could not find Kanban view on parent project — falling back to simple mode')
				}
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
		// PHASE 4b: Build comment lookup
		// When Trello API credentials are available, fetch ALL comments via
		// paginated API calls (the JSON export caps total actions at 1,000).
		// Otherwise fall back to the JSON actions array.
		let commentMap = new Map<string, any[]>()
		if (options.value.importComments) {
			if (hasTrelloApi.value && trelloApiValid.value && board.id) {
				updateProgress('Fetching all comments via Trello API...')
				try {
					commentMap = await fetchAllCommentsViaApi(board.id, trelloApiKey.value, trelloApiToken.value, log)
				} catch (apiErr: any) {
					log('error', `Trello API comment fetch failed, falling back to JSON: ${apiErr?.message || apiErr}`)
					// Fall through to JSON fallback below
				}
			}

			// Fallback: use JSON actions if API didn't run or failed
			if (commentMap.size === 0) {
				const actions = board.actions || []
				for (const action of actions) {
					if (action.type === 'commentCard' && action.data?.card?.id && action.data?.text) {
						const cardId = action.data.card.id
						const existing = commentMap.get(cardId) || []
						existing.push(action)
						commentMap.set(cardId, existing)
					}
				}
				for (const [, comments] of commentMap) {
					comments.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
				}
				if (commentMap.size > 0) {
					log('info', `Found ${[...commentMap.values()].reduce((n, c) => n + c.length, 0)} comments across ${commentMap.size} cards (from JSON, capped at 1000 total actions)`)
				}
			}
		}

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

				// ── Card cover color ──
				// Trello cards can have a solid color cover (no attachment).
				// Map it to Vikunja's hex_color for the task.
				if (card.cover?.color && !card.cover?.idAttachment) {
					const coverHex = trelloColorToHex(card.cover.color)
					if (coverHex) {
						payload.hex_color = coverHex
					}
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
					payload.done_at = new Date().toISOString()
				} else if (options.value.markDueCompleteAsDone && card.dueComplete) {
					payload.done = true
					payload.done_at = new Date().toISOString()
				}

				// ── Create the task via raw fetch ──
				const task = await createTaskRaw(projectId, payload)

				// Track done
				if (payload.done) {
					importStats.value.doneCount++
				}

				// ── Assign task to Kanban bucket ──
				if (options.value.kanbanMode !== 'none' && task.id) {
					try {
						if (options.value.kanbanMode === 'replicate' && parentKanbanViewId) {
							// Replicate mode: assign to the Trello-list bucket on parent project
							const listBucketId = trelloListBucketMap.get(card.idList)
							if (listBucketId) {
								await assignTaskToBucket(parentProject.id, parentKanbanViewId, listBucketId, task.id)
							} else {
								log('error', `No bucket mapped for list "${card.idList}" — task "${card.name}"`)
							}
						}

						// Simple mode: assign to To-Do or Done bucket on the task's project
						// Skip in replicate mode — replicate handles bucket assignment above
						if (options.value.kanbanMode === 'simple') {
							const simpleInfo = projectKanbanSimple.get(projectId)
							if (simpleInfo) {
								const targetBucket = payload.done
									? simpleInfo.doneBucketId
									: simpleInfo.todoBucketId
								await assignTaskToBucket(projectId, simpleInfo.viewId, targetBucket, task.id)
							}
						}
					} catch (bucketErr: any) {
						log('error', `Bucket assign failed for "${card.name}": ${bucketErr?.message || bucketErr}`)
					}
				}

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

				// ── Assign member labels + description note ──
				if (options.value.importMembers && card.idMembers?.length > 0) {
					const memberNames: string[] = []
					for (const memberId of card.idMembers) {
						const name = memberNameMap.get(memberId)
						if (name) memberNames.push(name)

						const vikunjaLabelId = memberLabelMap.get(memberId)
						if (vikunjaLabelId) {
							try {
								await labelTaskService.create(new LabelTask({
									taskId: task.id,
									labelId: vikunjaLabelId,
								}))
							} catch {
								// duplicate label assignment, ignore
							}
						}
					}

					// Append assignee note to description
					if (memberNames.length > 0) {
						const currentDesc = task.description || ''
						const assigneeNote = `\n\n> **Trello assignees:** ${memberNames.join(', ')}`
						const newDesc = currentDesc + assigneeNote
						try {
							const token = getAuthToken()
							await fetch(`/api/v1/tasks/${task.id}`, {
								method: 'POST',
								headers: {
									'Authorization': 'Bearer ' + token,
									'Content-Type': 'application/json',
								},
								body: JSON.stringify({ description: newDesc.trim() }),
							})
							task.description = newDesc.trim()
						} catch {
							// Not critical
						}
					}
				}

				// ── Import comments ──
				// Trello stores comments in board.actions with type 'commentCard'
				if (options.value.importComments && task.id) {
					const cardComments = commentMap.get(card.id) || []
					for (const comment of cardComments) {
						try {
							// Prepend original Trello author + date as header
							const author = comment.memberCreator?.fullName || comment.memberCreator?.username || 'Unknown'
							const date = comment.date ? new Date(comment.date).toLocaleString() : ''
							const header = `**${author}** — ${date}\n\n`
							await createCommentRaw(task.id, header + comment.data.text)
							importStats.value.comments++
						} catch (commentErr: any) {
							log('error', `Comment import failed for "${card.name}": ${commentErr?.message || commentErr}`)
						}
					}
				}

				// ── Download & re-upload attachments via Trello API ──
				// When API credentials are available, download each uploaded
				// attachment from Trello and upload it to Vikunja. Then update
				// the task description to embed images and link files.
				if (hasTrelloApi.value && trelloApiValid.value && task.id && card.attachments?.length > 0) {
					log('info', `Card "${card.name}" has ${card.attachments.length} attachment(s)`)
					const uploadedAtts: Array<{name: string, vikunjaId: number, mimeType: string, trelloAttId: string}> = []
					for (const att of card.attachments) {
						// Only download actual uploads, not linked URLs.
						// The JSON export may not include isUpload, so we also
						// check if the URL points to Trello's attachment hosting.
						const isTrelloHosted = att.url && (
							att.url.startsWith('https://trello.com/1/cards/') ||
							att.url.startsWith('https://trello-attachments.s3.') ||
							att.url.startsWith('https://trello.com/1/') ||
							att.url.includes('trello-backgrounds') ||
							att.url.includes('trello-attachments')
						)
						const isUpload = att.isUpload === true || (att.isUpload === undefined && isTrelloHosted)
						log('info', `  Attachment "${att.name}": isUpload=${att.isUpload}, isTrelloHosted=${isTrelloHosted}, willDownload=${isUpload}, url=${att.url?.substring(0, 80)}`)
						if (!isUpload) continue
						try {
							const vikunjaAtt = await downloadAndUploadAttachment(
								card.id, att, task.id,
								trelloApiKey.value, trelloApiToken.value,
							)
							if (vikunjaAtt) {
								uploadedAtts.push({
									name: att.name || att.fileName || 'file',
									vikunjaId: vikunjaAtt.id,
									mimeType: att.mimeType || '',
									trelloAttId: att.id || '',
								})
								importStats.value.attachments++
								log('success', `  Uploaded attachment "${att.name}" (id=${vikunjaAtt.id})`)
							} else {
								log('error', `  Attachment "${att.name}" download/upload returned null — check browser console for details`)
							}
						} catch (attErr: any) {
							log('error', `Attachment "${att.name}" failed for "${card.name}": ${attErr?.message || attErr}`)
						}
					}

					// Rebuild description: replace Trello attachment links with Vikunja URLs
					if (uploadedAtts.length > 0) {
						let newDesc = task.description || ''
						// Remove the old "### Attachments" section we built from JSON
						newDesc = newDesc.replace(/\n?\n?### Attachments\n[\s\S]*$/, '')

						if (newDesc.trim()) newDesc += '\n\n'
						newDesc += '### Attachments\n'
						for (const ua of uploadedAtts) {
							const url = `/api/v1/tasks/${task.id}/attachments/${ua.vikunjaId}`
							const isImage = ua.mimeType.startsWith('image/')
							if (isImage) {
								newDesc += `![${ua.name}](${url})\n`
							} else {
								newDesc += `- [${ua.name}](${url})\n`
							}
						}

						// Update the task description via API
						try {
							const token = getAuthToken()
							await fetch(`/api/v1/tasks/${task.id}`, {
								method: 'POST',
								headers: {
									'Authorization': 'Bearer ' + token,
									'Content-Type': 'application/json',
								},
								body: JSON.stringify({ description: newDesc.trim() }),
							})
						} catch {
							// Description update failed, attachments still exist on task
						}

						// Set cover image if the Trello card had one
						const coverId = card.idAttachmentCover || card.cover?.idAttachment
						if (coverId) {
							const coverAtt = uploadedAtts.find(ua => ua.trelloAttId === coverId)
							if (coverAtt) {
								try {
									const token = getAuthToken()
									await fetch(`/api/v1/tasks/${task.id}`, {
										method: 'POST',
										headers: {
											'Authorization': 'Bearer ' + token,
											'Content-Type': 'application/json',
										},
										body: JSON.stringify({ cover_image_attachment_id: coverAtt.vikunjaId }),
									})
									log('info', `  Set cover image for "${card.name}" (attachment ${coverAtt.vikunjaId})`)
								} catch {
									// Cover update failed, not critical
								}
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
		log('success', `Import complete! ${importStats.value.tasks} tasks across ${importStats.value.projects} projects (${importStats.value.datesSet} with dates, ${importStats.value.doneCount} marked done, ${importStats.value.buckets} kanban columns, ${importStats.value.comments} comments, ${importStats.value.attachments} attachments).`)

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

// Kanban mode radio group
.option-group {
	margin-block: 1rem;
	padding: 1rem;
	background: var(--grey-50);
	border-radius: 10px;
	border: 1px solid var(--grey-200);
}

.option-group-title {
	font-size: 0.9rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.03em;
	color: var(--grey-500);
	margin-block-end: 0.75rem;
}

.radio-options {
	display: flex;
	flex-direction: column;
	gap: 0.5rem;
}

.radio-option {
	display: flex;
	align-items: flex-start;
	gap: 0.6rem;
	padding: 0.7rem 0.9rem;
	border-radius: 8px;
	background: var(--grey-100);
	cursor: pointer;
	transition: all 150ms ease;
	border: 1px solid transparent;

	&:hover {
		background: var(--grey-200);
	}

	&.is-selected {
		background: var(--primary-light);
		border-color: var(--primary);
	}

	input[type="radio"] {
		margin-block-start: 0.2rem;
		flex-shrink: 0;
	}
}

.radio-content {
	display: flex;
	flex-direction: column;
	gap: 0.15rem;
}

.radio-title {
	font-weight: 600;
	font-size: 0.95rem;
}

.radio-desc {
	font-size: 0.8rem;
	color: var(--grey-500);
	line-height: 1.3;
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
	background: var(--card-background, var(--grey-100));
	border: 1px solid transparent;
	cursor: pointer;
	transition: all 150ms ease;

	&:hover {
		border-color: var(--grey-300);
	}

	&.is-selected {
		background: color-mix(in srgb, var(--primary) 12%, var(--card-background, var(--grey-100)));
		border-color: var(--primary);
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

.log-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-block-end: 0.5rem;
	position: sticky;
	inset-block-start: 0;
	background: var(--grey-100);
	padding-block: 0.25rem;
	z-index: 1;

	h3 {
		margin: 0;
		font-size: 0.85rem;
	}
}

.log-actions {
	display: flex;
	gap: 0.4rem;
}

.log-btn {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	padding: 0.3rem 0.6rem;
	border-radius: 5px;
	border: 1px solid var(--grey-300);
	background: var(--grey-200);
	color: var(--text);
	font-size: 0.75rem;
	font-family: inherit;
	cursor: pointer;
	transition: all 150ms ease;
	white-space: nowrap;

	&:hover {
		background: var(--grey-300);
		border-color: var(--grey-400);
	}

	&:active {
		transform: scale(0.96);
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
	padding-block-end: 3rem;
}

.trello-api-section {
	margin-block-start: 1.25rem;
	padding-block-start: 1rem;
}

.trello-api-toggle {
	background: var(--grey-100);
	border: 1px dashed var(--primary);
	border-radius: .5rem;
	color: var(--primary);
	cursor: pointer;
	font-size: .95rem;
	font-weight: 500;
	display: flex;
	align-items: center;
	gap: .5rem;
	padding: .5rem .85rem;
	width: 100%;
	transition: background .15s, border-color .15s;

	&:hover {
		background: color-mix(in srgb, var(--primary) 8%, transparent);
		border-style: solid;
	}
}

.trello-api-badge {
	font-size: .75rem;
	padding: .1rem .5rem;
	border-radius: 1rem;
	background: var(--success);
	color: #fff;
	font-weight: 600;
	margin-inline-start: auto;

	&.is-optional {
		background: color-mix(in srgb, var(--primary) 15%, transparent);
		color: var(--primary);
		font-weight: 500;
		border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);
	}
}

.trello-api-fields {
	margin-block-start: .75rem;
	padding-inline-start: 1.25rem;
}

.trello-api-desc {
	font-size: .85rem;
	color: var(--grey-500);
	margin-block-end: .5rem;
	line-height: 1.4;

	a {
		color: var(--primary);
	}
}

.trello-api-inputs {
	display: flex;
	gap: .5rem;
	flex-wrap: wrap;
	margin-block: .75rem;

	.input {
		flex: 1;
		min-inline-size: 200px;
	}
}

.trello-api-status {
	font-size: .85rem;
	padding: .4rem .75rem;
	border-radius: $radius;
	margin-block-start: .5rem;

	&.is-success {
		background: rgba(var(--success-rgb, 72, 199, 142), 0.15);
		color: var(--success);
	}

	&.is-error {
		background: rgba(var(--danger-rgb, 255, 56, 96), 0.15);
		color: var(--danger);
	}
}
</style>
