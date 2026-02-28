/**
 * useUserPreferences — synced user preferences composable.
 *
 * On first call, loads preferences from the API and caches them in a
 * module-level reactive Map. Individual consumers read/write via
 * `get(key)` / `set(key, value)` which update both the local cache
 * and persist to the API (debounced).
 *
 * Falls back to localStorage when the API is unavailable (e.g. link
 * shares, offline, unauthenticated).
 */
import {reactive, ref} from 'vue'
import {getUserPreferences, saveUserPreferences} from '@/services/userPreferencesApi'

// Module-level singleton state (shared across all composable users)
const cache = reactive<Record<string, string>>({})
const loaded = ref(false)
const loading = ref(false)
const apiAvailable = ref(true)

// Debounce timer for batching writes
let pendingWrites: Record<string, string> = {}
let writeTimer: ReturnType<typeof setTimeout> | null = null
const WRITE_DEBOUNCE_MS = 800

// Local storage fallback key
const LS_FALLBACK_KEY = 'vikunja-user-preferences'

function readLocalFallback(): Record<string, string> {
	try {
		const raw = localStorage.getItem(LS_FALLBACK_KEY)
		if (raw) return JSON.parse(raw)
	} catch {}
	return {}
}

function writeLocalFallback() {
	try {
		localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(cache))
	} catch {}
}

// Migrate existing localStorage gantt keys into the cache (one-time)
function migrateLocalStorageKeys() {
	const migrations: Record<string, string> = {
		'gantt-cascade-mode': 'gantt-cascade-mode',
		'gantt-cascade-prompt-style': 'gantt-cascade-prompt-style',
		'gantt-arrow-config': 'gantt-arrow-config',
	}

	let migrated = false
	for (const [lsKey, prefKey] of Object.entries(migrations)) {
		try {
			const val = localStorage.getItem(lsKey)
			if (val && !cache[prefKey]) {
				cache[prefKey] = val
				pendingWrites[prefKey] = val
				migrated = true
				// Remove from localStorage after migration
				localStorage.removeItem(lsKey)
			}
		} catch {}
	}

	if (migrated) {
		flushWrites()
	}
}

async function flushWrites() {
	if (Object.keys(pendingWrites).length === 0) return

	const toWrite = {...pendingWrites}
	pendingWrites = {}

	if (apiAvailable.value) {
		try {
			const updated = await saveUserPreferences(toWrite)
			// Merge server response back
			Object.assign(cache, updated)
		} catch {
			// API failed — keep in local cache, mark unavailable
			apiAvailable.value = false
			writeLocalFallback()
		}
	} else {
		writeLocalFallback()
	}
}

function scheduleWrite() {
	if (writeTimer) clearTimeout(writeTimer)
	writeTimer = setTimeout(() => {
		writeTimer = null
		flushWrites()
	}, WRITE_DEBOUNCE_MS)
}

export function useUserPreferences() {
	/**
	 * Initialize — call once near app startup (e.g. in App.vue or a layout).
	 * Safe to call multiple times; only loads once.
	 */
	async function init() {
		if (loaded.value || loading.value) return
		loading.value = true

		try {
			const prefs = await getUserPreferences()
			Object.assign(cache, prefs)
			apiAvailable.value = true
			loaded.value = true

			// Migrate old localStorage keys into the API
			migrateLocalStorageKeys()
		} catch {
			// API unavailable — fall back to localStorage
			apiAvailable.value = false
			const local = readLocalFallback()
			Object.assign(cache, local)
			loaded.value = true
		} finally {
			loading.value = false
		}
	}

	/**
	 * Get a preference value. Returns the default if not set.
	 */
	function get(key: string, defaultValue: string = ''): string {
		if (key in cache) return cache[key]

		// If not loaded yet, try localStorage as temporary read
		if (!loaded.value) {
			try {
				const val = localStorage.getItem(key)
				if (val !== null) return val
			} catch {}
		}

		return defaultValue
	}

	/**
	 * Set a preference. Updates cache immediately, debounces API write.
	 */
	function set(key: string, value: string) {
		cache[key] = value
		pendingWrites[key] = value
		writeLocalFallback() // Always keep local copy in sync
		scheduleWrite()
	}

	/**
	 * Get a preference parsed as JSON, with a typed default.
	 */
	function getJSON<T>(key: string, defaultValue: T): T {
		const raw = get(key, '')
		if (!raw) return defaultValue
		try {
			return JSON.parse(raw) as T
		} catch {
			return defaultValue
		}
	}

	/**
	 * Set a preference as JSON.
	 */
	function setJSON<T>(key: string, value: T) {
		set(key, JSON.stringify(value))
	}

	/**
	 * Force flush any pending writes immediately.
	 */
	async function flush() {
		if (writeTimer) {
			clearTimeout(writeTimer)
			writeTimer = null
		}
		await flushWrites()
	}

	return {
		cache,
		loaded,
		loading,
		apiAvailable,
		init,
		get,
		set,
		getJSON,
		setJSON,
		flush,
	}
}
