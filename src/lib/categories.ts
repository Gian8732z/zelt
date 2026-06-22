import { getSupabase } from './supabase';
import type { Category } from './types';

const CACHE_KEY = 'zelt:categories';

/** Last-known categories, read synchronously so the reporter form renders instantly offline. */
export function cachedCategories(): Category[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]') as Category[];
	} catch {
		return [];
	}
}

/** Fetch active categories and refresh the offline cache; falls back to cache when offline. */
export async function fetchActiveCategories(): Promise<Category[]> {
	const sb = getSupabase();
	if (!sb) return cachedCategories();
	const { data, error } = await sb
		.from('categories')
		.select('*')
		.eq('active', true)
		.order('sort_order');
	if (error || !data) return cachedCategories();
	try {
		localStorage.setItem(CACHE_KEY, JSON.stringify(data));
	} catch {
		/* storage full / unavailable — non-fatal */
	}
	return data as Category[];
}
