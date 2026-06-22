// Public reporter submit endpoint. The reporter is anonymous; the gate is REPORTER_TOKEN
// (the secret embedded in the QR-code URL). Uses the service role to insert, so anonymous
// clients never get direct table access. Idempotent on report_id.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REPORTER_TOKEN = Deno.env.get('REPORTER_TOKEN') ?? '';

const BUCKET = 'damage-photos';
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const RL_MAX = 20; // submissions per IP per window
const RL_WINDOW = 60; // seconds

const cors = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
	'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...cors, 'content-type': 'application/json' }
	});
}

async function sha256Hex(s: string): Promise<string> {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
	if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

	const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

	let form: FormData;
	try {
		form = await req.formData();
	} catch {
		return json({ error: 'bad_request' }, 400);
	}

	// 1. Token gate
	const token = String(form.get('token') ?? '');
	if (!REPORTER_TOKEN || token !== REPORTER_TOKEN) return json({ error: 'unauthorized' }, 401);

	// 2. Rate limit by hashed client IP (best effort)
	const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
	const key = (await sha256Hex(ip)).slice(0, 32);
	const { data: allowed, error: rlErr } = await admin.rpc('rl_hit', {
		p_key: key,
		p_max: RL_MAX,
		p_window_seconds: RL_WINDOW
	});
	if (!rlErr && allowed === false) return json({ error: 'rate_limited' }, 429);

	// 3. Parse + validate
	const report_id = String(form.get('report_id') ?? '');
	const tent_id = Number(form.get('tent_id'));
	const notes = String(form.get('notes') ?? '').slice(0, 2000);
	let category_ids: unknown;
	let category_labels: unknown;
	try {
		category_ids = JSON.parse(String(form.get('category_ids') ?? '[]'));
		category_labels = JSON.parse(String(form.get('category_labels') ?? '[]'));
	} catch {
		return json({ error: 'bad_categories' }, 400);
	}

	if (!UUID_RE.test(report_id)) return json({ error: 'bad_report_id' }, 400);
	if (!Number.isInteger(tent_id) || tent_id < 1 || tent_id > 999)
		return json({ error: 'bad_tent' }, 400);
	if (!Array.isArray(category_ids) || category_ids.length === 0)
		return json({ error: 'no_categories' }, 400);
	if (!Array.isArray(category_labels)) category_labels = [];

	const tsMs = Date.parse(String(form.get('reported_at') ?? ''));
	const reportedIso = Number.isNaN(tsMs) ? new Date().toISOString() : new Date(tsMs).toISOString();

	// 4. Idempotency — already stored? Treat as success.
	const { data: existing } = await admin
		.from('damages')
		.select('report_id')
		.eq('report_id', report_id)
		.maybeSingle();
	if (existing) return json({ ok: true, duplicate: true });

	// 5. Optional photo (already EXIF-stripped + downscaled client-side)
	let photo_path: string | null = null;
	const photo = form.get('photo');
	if (photo instanceof File && photo.size > 0) {
		if (photo.size > MAX_PHOTO_BYTES) return json({ error: 'photo_too_large' }, 413);
		const bytes = new Uint8Array(await photo.arrayBuffer());
		const path = `${report_id}.jpg`;
		const { error: upErr } = await admin.storage
			.from(BUCKET)
			.upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
		if (upErr) return json({ error: 'upload_failed', detail: upErr.message }, 500);
		photo_path = path;
	}

	// 6. Insert
	const { error: insErr } = await admin.from('damages').insert({
		report_id,
		tent_id,
		reported_at: reportedIso,
		category_ids,
		category_labels,
		notes: notes || null,
		photo_path,
		status: 'open'
	});
	if (insErr) {
		// Unique violation: a concurrent retry already inserted it — idempotent success.
		if ((insErr as { code?: string }).code === '23505') return json({ ok: true, duplicate: true });
		return json({ error: 'insert_failed', detail: insErr.message }, 500);
	}

	return json({ ok: true });
});
