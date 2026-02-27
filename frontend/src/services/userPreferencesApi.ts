import {AuthenticatedHTTPFactory} from '@/helpers/fetcher'

const http = AuthenticatedHTTPFactory()

export async function getUserPreferences(): Promise<Record<string, string>> {
	const response = await http.get('/user/settings/preferences')
	return response.data || {}
}

export async function saveUserPreferences(prefs: Record<string, string>): Promise<Record<string, string>> {
	const response = await http.post('/user/settings/preferences', prefs)
	return response.data || {}
}

export async function deleteUserPreference(key: string): Promise<void> {
	await http.delete(`/user/settings/preferences/${encodeURIComponent(key)}`)
}
