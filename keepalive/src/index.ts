// Pings the Supabase REST API with the public anon key so the seasonal free-tier project
// registers activity and does not auto-pause. A single, cheap read of one category row is
// enough to count as a request. Runs on the daily cron (see wrangler.jsonc); the fetch
// handler exposes the same ping over HTTP for manual verification.

interface Env {
	SUPABASE_URL: string;
	SUPABASE_ANON_KEY: string;
}

async function ping(env: Env): Promise<{ status: number; ok: boolean }> {
	const res = await fetch(`${env.SUPABASE_URL}/rest/v1/categories?select=id&limit=1`, {
		headers: {
			apikey: env.SUPABASE_ANON_KEY,
			Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`
		}
	});
	// Drain the body so the connection completes cleanly.
	await res.text();
	return { status: res.status, ok: res.ok };
}

export default {
	async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
		ctx.waitUntil(
			ping(env).then((r) => console.log('keepalive', controller.cron, 'status', r.status))
		);
	},

	async fetch(_req: Request, env: Env): Promise<Response> {
		const r = await ping(env);
		return new Response(JSON.stringify({ keepalive: r.ok, supabaseStatus: r.status }), {
			status: r.ok ? 200 : 502,
			headers: { 'content-type': 'application/json' }
		});
	}
};
