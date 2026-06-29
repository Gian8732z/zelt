import { env } from '$env/dynamic/public';

// Dynamic (not static) public env so the app still builds and runs before Supabase is wired up —
// pages degrade to a friendly "not configured" notice instead of failing the build.
export const SUPABASE_URL = env.PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = env.PUBLIC_SUPABASE_ANON_KEY ?? '';
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const FUNCTIONS_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1` : '';
export const PHOTO_BUCKET = 'damage-photos';

// The reporter's submit/read gate. No longer in the QR URL — bundled here so the clean per-tent
// URL (`/zelt/<id>`) carries no secret and never needs reprinting when the token rotates. This is
// only as secret as a token printed on a QR sticker (i.e. low), which is fine: the Edge Functions
// rate-limit and the manager can mark reports invalid. Must match the functions' REPORTER_TOKEN.
export const REPORTER_TOKEN = env.PUBLIC_REPORTER_TOKEN ?? '';
