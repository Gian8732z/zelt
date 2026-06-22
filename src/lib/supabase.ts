import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from './config';

let client: SupabaseClient | null = null;

/** Returns the browser Supabase client, or null when the project isn't configured yet. */
export function getSupabase(): SupabaseClient | null {
	if (!isConfigured) return null;
	if (!client) {
		client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
			auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
		});
	}
	return client;
}
