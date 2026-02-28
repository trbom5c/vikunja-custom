import {reactive, watch, type WatchStopHandle} from 'vue'

const STORAGE_KEY = 'gantt-arrow-config'

export interface GanttArrowConfig {
	enabled: boolean
	strokeWidth: number
	dashArray: string
	opacity: number
	pathMode: 'bezier' | 'stepped' | 'stepRounded'
	// Bezier
	cp1X: number
	cp1Y: number
	cp2X: number
	cp2Y: number
	// Stepped
	exitDir: 'right' | 'bottom'
	entryDir: 'left' | 'top'
	exitOffset: number
	entryOffset: number
	exitLength: number
	entryLength: number
	cornerRadius: number
	// General
	arrowSize: number
	showDots: boolean
	dotRadius: number
	showShadow: boolean
	shadowWidth: number
	shadowOpacity: number
	palette: 'multi' | 'mono'
}

const DEFAULTS: GanttArrowConfig = {
	enabled: true,
	strokeWidth: 1.5,
	dashArray: '2,2',
	opacity: 0.5,
	pathMode: 'stepRounded',
	cp1X: 0.5,
	cp1Y: 0,
	cp2X: 0.5,
	cp2Y: 0,
	exitDir: 'bottom',
	entryDir: 'left',
	exitOffset: 0.5,
	entryOffset: 0.5,
	exitLength: 30,
	entryLength: 20,
	cornerRadius: 11,
	arrowSize: 8,
	showDots: false,
	dotRadius: 3,
	showShadow: false,
	shadowWidth: 4,
	shadowOpacity: 0.2,
	palette: 'multi',
}

// ── Lazy singleton state ──
// The reactive config object is created once on first use.
// useUserPreferences is ONLY imported dynamically to avoid TDZ errors
// from module-scope composable access.
let arrowConfig: ReturnType<typeof reactive<GanttArrowConfig>> | null = null
let initialized = false
let saveWatchStop: WatchStopHandle | null = null

/**
 * Load config from localStorage first (synchronous, always available),
 * then async-hydrate from the user preferences API.
 */
function loadFromLocalStorage(): GanttArrowConfig {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (raw) {
			return {...DEFAULTS, ...JSON.parse(raw)}
		}
	} catch {}
	return {...DEFAULTS}
}

function saveToLocalStorage(config: GanttArrowConfig) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
	} catch {}
}

function ensureInitialized() {
	if (initialized) return
	initialized = true

	// 1. Immediate: load from localStorage (always works, no composable needed)
	arrowConfig = reactive<GanttArrowConfig>(loadFromLocalStorage())

	// 2. Auto-save to localStorage on any change
	saveWatchStop = watch(arrowConfig, (val) => {
		saveToLocalStorage(val)
	}, {deep: true})

	// 3. Deferred: async-import useUserPreferences to hydrate from API
	//    and set up API persistence. This avoids any TDZ issues from
	//    importing the composable at module scope.
	import('@/composables/useUserPreferences').then(({useUserPreferences}) => {
		try {
			const prefs = useUserPreferences()

			// Hydrate from API if prefs are already loaded
			const apiRaw = prefs.get(STORAGE_KEY, '')
			if (apiRaw && arrowConfig) {
				try {
					const apiConfig = {...DEFAULTS, ...JSON.parse(apiRaw)}
					const apiJson = JSON.stringify(apiConfig)
					const currentJson = JSON.stringify(arrowConfig)
					if (apiJson !== currentJson) {
						Object.assign(arrowConfig, apiConfig)
					}
				} catch {}
			}

			// Watch for prefs loaded (API might not be ready yet)
			watch(() => prefs.loaded, (isLoaded) => {
				if (isLoaded && arrowConfig) {
					const freshRaw = prefs.get(STORAGE_KEY, '')
					if (freshRaw) {
						try {
							const fresh = {...DEFAULTS, ...JSON.parse(freshRaw)}
							const freshJson = JSON.stringify(fresh)
							const currentJson = JSON.stringify(arrowConfig)
							if (freshJson !== currentJson) {
								Object.assign(arrowConfig, fresh)
							}
						} catch {}
					}
				}
			}, {immediate: true})

			// Also persist to API on changes (in addition to localStorage)
			watch(arrowConfig!, (val) => {
				prefs.set(STORAGE_KEY, JSON.stringify(val))
			}, {deep: true})
		} catch {}
	}).catch(() => {
		// useUserPreferences not available — localStorage-only mode, which is fine
	})
}

export function useGanttArrowConfig() {
	ensureInitialized()

	function resetToDefaults() {
		Object.assign(arrowConfig!, DEFAULTS)
	}

	function importConfig(json: string) {
		try {
			const parsed = JSON.parse(json)
			Object.assign(arrowConfig!, {...DEFAULTS, ...parsed})
		} catch {
			// ignore
		}
	}

	function exportConfig(): string {
		return JSON.stringify(arrowConfig!, null, 2)
	}

	return {
		config: arrowConfig!,
		defaults: DEFAULTS,
		resetToDefaults,
		importConfig,
		exportConfig,
	}
}
