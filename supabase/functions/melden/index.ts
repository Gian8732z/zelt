// Public reporter submit endpoint. The reporter is anonymous; the gate is REPORTER_TOKEN
// (the secret embedded in the QR-code URL). Uses the service role to insert, so anonymous
// clients never get direct table access.
//
// One submission carries several damage items (see docs/PRD-per-tent-qr-info-page.md) and is
// expanded into ONE `damages` row per item, each independently resolvable. Each item carries its
// own client-generated report_id (so the insert is idempotent per row) plus an optional photo and
// comment of its own. The current camp (CURRENT_CAMP) and the reporter name are stamped onto every
// row of the submission.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REPORTER_TOKEN = Deno.env.get('REPORTER_TOKEN') ?? '';
const CURRENT_CAMP = Deno.env.get('CURRENT_CAMP') ?? ''; // stamped onto every row ('' => null)

const BUCKET = 'damage-photos';
const MAX_PHOTO_BYTES = 4 * 1024 * 1024; // per photo
const MAX_TOTAL_PHOTO_BYTES = 10 * 1024 * 1024; // all photos of one submission combined
const RL_MAX = 20; // submissions per IP per window
const RL_WINDOW = 60; // seconds
const MAX_ITEMS = 20; // one tent has only so many distinct things to report at once

// Allowed (component → damage_kind) pairs — must stay in sync with src/lib/damage-types.ts.
const VALID: Record<string, Set<string>> = {
	aussenzelt: new Set(['stoff_gerissen', 'abspannung_gerissen', 'abspannung_haken_defekt', 'oese_kaputt', 'fehlt', 'sonstiges']),
	innenzelt: new Set(['stoff_gerissen', 'aufhaengung_gerissen', 'schnur_aussenzelt_gerissen', 'reissverschluss_defekt', 'boden_gerissen', 'fehlt', 'sonstiges']),
	vorzelt: new Set(['stoff_gerissen', 'abspannung_gerissen', 'abspannung_haken_defekt', 'oese_kaputt', 'fehlt', 'sonstiges']),
	stangen: new Set(['verbogen', 'fehlt']),
	heringe: new Set(['fehlt']),
	sonstiges: new Set(['sonstiges'])
};

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

interface ItemRow {
	report_id: string;
	component: string;
	damage_kind: string;
	label: string;
	quantity: number | null;
	notes: string | null;
}

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

	// 3. Parse + validate the submission
	const tent_id = Number(form.get('tent_id'));
	if (!Number.isInteger(tent_id) || tent_id < 1 || tent_id > 999)
		return json({ error: 'bad_tent' }, 400);

	// Reporter name is required (the form enforces it client-side too) — accountability for who
	// flagged the damage. Stamped onto every row of the submission.
	const reporter_name = String(form.get('reporter_name') ?? '').slice(0, 100).trim();
	if (!reporter_name) return json({ error: 'bad_name' }, 400);

	let rawItems: unknown;
	try {
		rawItems = JSON.parse(String(form.get('items') ?? '[]'));
	} catch {
		return json({ error: 'bad_items' }, 400);
	}
	if (!Array.isArray(rawItems) || rawItems.length === 0) return json({ error: 'no_items' }, 400);
	if (rawItems.length > MAX_ITEMS) return json({ error: 'too_many_items' }, 400);

	const items: ItemRow[] = [];
	for (const raw of rawItems) {
		const it = raw as Record<string, unknown>;
		const report_id = String(it.report_id ?? '');
		const component = String(it.component ?? '');
		const damage_kind = String(it.damage_kind ?? '');
		if (!UUID_RE.test(report_id)) return json({ error: 'bad_report_id' }, 400);
		if (!VALID[component]?.has(damage_kind)) return json({ error: 'bad_damage' }, 400);
		const qtyNum = Number(it.quantity);
		const quantity = Number.isInteger(qtyNum) && qtyNum > 0 ? qtyNum : null;
		const label = String(it.label ?? `${component} ${damage_kind}`).slice(0, 200);
		const desc = String(it.description ?? '').slice(0, 2000).trim();
		// Sonstiges is meaningless without a description; every other mode's comment is optional.
		if (damage_kind === 'sonstiges' && !desc) return json({ error: 'missing_description' }, 400);
		items.push({ report_id, component, damage_kind, label, quantity, notes: desc || null });
	}

	const tsMs = Date.parse(String(form.get('reported_at') ?? ''));
	const reportedIso = Number.isNaN(tsMs) ? new Date().toISOString() : new Date(tsMs).toISOString();

	// 4. Optional per-item photos (already EXIF-stripped + downscaled client-side). Each present
	// photo arrives as its own multipart part `photo_<report_id>` and is stored at <report_id>.jpg,
	// attached to that one row. Validate all sizes (per photo + combined) before uploading anything.
	const photoBytes = new Map<string, Uint8Array>();
	let totalPhotoBytes = 0;
	for (const it of items) {
		const part = form.get(`photo_${it.report_id}`);
		if (!(part instanceof File) || part.size === 0) continue;
		if (part.size > MAX_PHOTO_BYTES) return json({ error: 'photo_too_large' }, 413);
		totalPhotoBytes += part.size;
		if (totalPhotoBytes > MAX_TOTAL_PHOTO_BYTES) return json({ error: 'photos_too_large' }, 413);
		photoBytes.set(it.report_id, new Uint8Array(await part.arrayBuffer()));
	}

	const photoPath = new Map<string, string>();
	for (const [report_id, bytes] of photoBytes) {
		const path = `${report_id}.jpg`;
		const { error: upErr } = await admin.storage
			.from(BUCKET)
			.upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
		if (upErr) return json({ error: 'upload_failed', detail: upErr.message }, 500);
		photoPath.set(report_id, path);
	}

	// 5. Insert one row per item. Upsert by report_id keeps a retried submission idempotent even
	// if some rows already landed before a lost ack.
	const rows = items.map((it) => ({
		report_id: it.report_id,
		tent_id,
		reported_at: reportedIso,
		component: it.component,
		damage_kind: it.damage_kind,
		quantity: it.quantity,
		category_ids: [],
		category_labels: [it.label],
		notes: it.notes,
		photo_path: photoPath.get(it.report_id) ?? null,
		reporter_name,
		camp: CURRENT_CAMP || null,
		status: 'open'
	}));

	const { error: insErr } = await admin
		.from('damages')
		.upsert(rows, { onConflict: 'report_id', ignoreDuplicates: true });
	if (insErr) return json({ error: 'insert_failed', detail: insErr.message }, 500);

	return json({ ok: true, inserted: rows.length });
});
