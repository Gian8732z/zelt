import { FUNCTIONS_URL, SUPABASE_ANON_KEY } from './config';
import { queueReport, allQueued, removeQueued } from './outbox';
import type { OutboxReport } from './types';

export type SubmitResult = 'sent' | 'queued';

function toFormData(r: OutboxReport): FormData {
	const fd = new FormData();
	fd.set('token', r.token);
	fd.set('submission_id', r.submission_id);
	fd.set('tent_id', String(r.tent_id));
	fd.set('reporter_name', r.reporter_name);
	fd.set('reported_at', r.reported_at);
	// Items as JSON without their Blobs; each item's photo (if any) rides along as a separate
	// multipart part keyed by its report_id, so the function can attach it to that exact row.
	fd.set(
		'items',
		JSON.stringify(
			r.items.map((it) => ({
				report_id: it.report_id,
				component: it.component,
				damage_kind: it.damage_kind,
				label: it.label,
				quantity: it.quantity,
				description: it.description
			}))
		)
	);
	for (const it of r.items) {
		if (it.photo) fd.set(`photo_${it.report_id}`, it.photo, `${it.report_id}.jpg`);
	}
	return fd;
}

function postReport(r: OutboxReport): Promise<Response> {
	return fetch(`${FUNCTIONS_URL}/melden`, {
		method: 'POST',
		// The anon key satisfies the Supabase platform; the real gate is the reporter token,
		// which the Edge Function validates server-side.
		headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY },
		body: toFormData(r)
	});
}

// 4xx that isn't a transient timeout/rate-limit means the server permanently rejected the
// report (bad token, validation). Those should surface or be dropped, never retried forever.
function isPermanentReject(status: number): boolean {
	return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/** Network-first: send immediately when possible, otherwise queue locally for later sync. */
export async function submitReport(r: OutboxReport): Promise<SubmitResult> {
	if (!navigator.onLine) {
		await queueReport(r);
		return 'queued';
	}
	try {
		const res = await postReport(r);
		if (res.ok) return 'sent';
		if (isPermanentReject(res.status)) {
			const msg = await res.text().catch(() => '');
			throw new Error(msg || `Serverfehler (${res.status})`);
		}
		await queueReport(r); // transient (5xx / 429 / 408) — try again later
		return 'queued';
	} catch (err) {
		// fetch throws TypeError on real network failure (offline, captive portal) despite
		// navigator.onLine — queue rather than lose the report.
		if (err instanceof TypeError) {
			await queueReport(r);
			return 'queued';
		}
		throw err;
	}
}

/** Drain the offline queue. Safe to call repeatedly; the server upserts by report_id. */
export async function flushOutbox(): Promise<number> {
	if (!navigator.onLine) return 0;
	let sent = 0;
	for (const r of await allQueued()) {
		try {
			const res = await postReport(r);
			if (res.ok) {
				await removeQueued(r.submission_id);
				sent++;
			} else if (isPermanentReject(res.status)) {
				// e.g. token rotated since queuing — drop so it doesn't wedge the queue.
				await removeQueued(r.submission_id);
			}
		} catch {
			break; // still offline — stop this pass, keep the rest queued
		}
	}
	return sent;
}
