import { env } from '$env/dynamic/public';

// Dynamic (not static) public env so the app still builds and runs before Supabase is wired up —
// pages degrade to a friendly "not configured" notice instead of failing the build.
export const SUPABASE_URL = env.PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = env.PUBLIC_SUPABASE_ANON_KEY ?? '';
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const FUNCTIONS_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : '';
export const PHOTO_BUCKET = 'damage-photos';
