/**
 * Persists preferences to localStorage on every render where `prefs` changes.
 * Synchronous and idempotent — safe to call during render.
 */
export function usePersistPrefs(key: string, prefs: Record<string, unknown>): void {
  try {
    localStorage.setItem(key, JSON.stringify(prefs));
  } catch { /* quota exceeded or private mode */ }
}
