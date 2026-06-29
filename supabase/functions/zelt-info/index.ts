// Public per-tent read endpoint (see docs/PRD-per-tent-qr-info-page.md). Returns ONLY the one
// tent the reporter scanned: its computed status and its list of open damages (label + quantity +
// description). Deliberately scoped — never the fleet, never another tent, never photos or
// resolution history. Same security model as `melden`: anonymous, gated by REPORTER_TOKEN, reads
// via the service role so anon clients never touch the tables directly.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const REPORTER_TOKEN = Deno.env.get('REPORTER_TOKEN') ?? '';

const RL_MAX = 60; // reads per IP per window (cheaper than writes, so a higher ceiling)
const RL_WINDOW = 60;

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

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
	if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

	let body: { token?: string; tent_id?: number };
	try {
		body = await req.json();
	} catch {
		return json({ error: 'bad_request' }, 400);
	}

	// 1. Token gate
	if (!REPORTER_TOKEN || String(body.token ?? '') !== REPORTER_TOKEN)
		return json({ error: 'unauthorized' }, 401);

	const tent_id = Number(body.tent_id);
	if (!Number.isInteger(tent_id) || tent_id < 1 || tent_id > 999)
		return json({ error: 'bad_tent' }, 400);

	const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

	// 2. Rate limit by hashed client IP (best effort), distinct bucket from `melden`.
	const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
	const key = 'info:' + (await sha256Hex(ip)).slice(0, 26);
	const { data: allowed, error: rlErr } = await admin.rpc('rl_hit', {
		p_key: key,
		p_max: RL_MAX,
		p_window_seconds: RL_WINDOW
	});
	if (!rlErr && allowed === false) return json({ error: 'rate_limited' }, 429);

	// 3. Read exactly this tent + its open damages.
	const { data: tent, error: te } = await admin
		.from('tents')
		.select('tent_id, label, out_of_service')
		.eq('tent_id', tent_id)
		.maybeSingle();
	if (te) return json({ error: 'read_failed' }, 500);
	if (!tent) return json({ error: 'unknown_tent' }, 404);

	const { data: open, error: de } = await admin
		.from('damages')
		.select('component, damage_kind, category_labels, quantity, notes, reported_at')
		.eq('tent_id', tent_id)
		.eq('status', 'open')
		.order('reported_at', { ascending: false });
	if (de) return json({ error: 'read_failed' }, 500);

	const openDamages = (open ?? []).map((d) => ({
		component: d.component,
		damage_kind: d.damage_kind,
		label: (d.category_labels?.[0] as string | undefined) ?? d.component,
		quantity: d.quantity,
		description: d.notes,
		reported_at: d.reported_at
	}));

	const status = tent.out_of_service
		? 'out_of_service'
		: openDamages.length > 0
			? 'damaged'
			: 'active';

	return json({ tent_id, label: tent.label, status, open: openDamages });
});
