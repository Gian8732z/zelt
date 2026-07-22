// Pings each seasonal free-tier Supabase project with the public anon key so it registers activity
// and does not auto-pause. The ping is a WRITE (the heartbeat() RPC) — a daily anon read did NOT
// count as activity for Supabase's pause scanner (both projects were flagged for pause despite a
// month of successful daily reads); only a WAL-generating write counts. See migration
// 0009_heartbeat.sql. Runs on the daily cron (see wrangler.jsonc); the fetch handler exposes the
// same pings over HTTP for manual verification.
//
// Both projects need this independently — pause is per-project: prod serves the app, and
// staging backs the per-PR previews plus the staging-first migration step of `deploy-prod`.
// A paused staging is what made `supabase db push` fail transiently in CI after quiet weeks.

interface Env {
	SUPABASE_URL: string;
	SUPABASE_ANON_KEY: string;
	STAGING_SUPABASE_URL: string;
	STAGING_SUPABASE_ANON_KEY: string;
}

interface Target {
	name: string;
	url: string;
	anonKey: string;
}

function targets(env: Env): Target[] {
	return [
		{ name: 'prod', url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY },
		{ name: 'staging', url: env.STAGING_SUPABASE_URL, anonKey: env.STAGING_SUPABASE_ANON_KEY }
	].filter((t) => t.url && t.anonKey);
}

async function ping(t: Target): Promise<{ name: string; status: number; ok: boolean }> {
	// POST to the heartbeat() RPC — a write, so it generates WAL and reliably counts as activity.
	// Returns 204 (void); res.ok covers the 2xx range.
	const res = await fetch(`${t.url}/rest/v1/rpc/heartbeat`, {
		method: 'POST',
		headers: {
			apikey: t.anonKey,
			Authorization: `Bearer ${t.anonKey}`,
			'Content-Type': 'application/json'
		},
		body: '{}'
	});
	// Drain the body so the connection completes cleanly.
	await res.text();
	return { name: t.name, status: res.status, ok: res.ok };
}

export default {
	async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
		ctx.waitUntil(
			Promise.all(targets(env).map(ping)).then((results) => {
				for (const r of results) {
					console.log('keepalive', controller.cron, r.name, 'status', r.status);
				}
			})
		);
	},

	async fetch(_req: Request, env: Env): Promise<Response> {
		const results = await Promise.all(targets(env).map(ping));
		const ok = results.length > 0 && results.every((r) => r.ok);
		return new Response(JSON.stringify({ keepalive: ok, targets: results }), {
			status: ok ? 200 : 502,
			headers: { 'content-type': 'application/json' }
		});
	}
};
