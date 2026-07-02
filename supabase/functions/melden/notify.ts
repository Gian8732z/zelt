// Manager notification for a new damage report. Sent from `melden` after a submission's rows
// actually land (one email per submission, summarizing all items). Best-effort and non-fatal:
// the reporter's submit never depends on this — it runs in the background via
// EdgeRuntime.waitUntil and swallows its own errors.
//
// Delivery uses the Resend HTTP API, gated on the RESEND_API_KEY secret. With no key set (local
// dev, ephemeral-local CI) the whole thing is a no-op, so tests never try to send. Recipients are
// resolved dynamically from auth.users — signup is invite-only, so every user is a manager. Until a
// verified sending domain exists, Resend's onboarding@resend.dev sender only delivers to the account
// owner; the recipient logic is already dynamic, so adding a domain later needs no code change.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM = Deno.env.get('NOTIFY_FROM') ?? 'Zelt <onboarding@resend.dev>';
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://zelt.pages.dev').replace(/\/$/, '');

export interface NotifyItem {
	component: string;
	damage_kind: string;
	label: string;
	quantity: number | null;
	notes: string | null;
}

export interface NotifyInput {
	tent_id: number;
	reporter_name: string;
	camp: string | null;
	items: NotifyItem[];
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

// Pure: turns a submission into the email's subject + text + html. Kept separate from delivery so
// the wording is easy to eyeball and adjust.
export function buildEmail(input: NotifyInput): { subject: string; text: string; html: string } {
	const { tent_id, reporter_name, camp, items } = input;
	const campSuffix = camp ? ` (${camp})` : '';
	const subject = `Neuer Schaden: Zelt ${tent_id}${campSuffix}`;
	const detailUrl = `${APP_URL}/verwalten/zelt/${tent_id}`;

	const line = (it: NotifyItem) => {
		const qty = it.quantity && it.quantity > 1 ? ` (${it.quantity}x)` : '';
		const note = it.notes ? ` — „${it.notes}“` : '';
		return `${it.label}${qty}${note}`;
	};

	const text = [
		`Zelt ${tent_id} — gemeldet von ${reporter_name}`,
		camp ? `Camp: ${camp}` : null,
		'',
		...items.map((it) => `• ${line(it)}`),
		'',
		`Im Manager öffnen: ${detailUrl}`
	]
		.filter((l) => l !== null)
		.join('\n');

	const rows = items
		.map((it) => `<li style="margin:4px 0">${escapeHtml(line(it))}</li>`)
		.join('');
	const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#111">
  <p style="margin:0 0 4px"><strong>Zelt ${tent_id}</strong> — gemeldet von ${escapeHtml(reporter_name)}</p>
  ${camp ? `<p style="margin:0 0 12px;color:#555">Camp: ${escapeHtml(camp)}</p>` : ''}
  <ul style="margin:0 0 16px;padding-left:20px">${rows}</ul>
  <p style="margin:0"><a href="${detailUrl}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">Im Manager öffnen</a></p>
</div>`;

	return { subject, text, html };
}

// Resolve every manager's email. Invite-only signup ⇒ every auth user is a manager. Paginated to be
// safe, though the fleet has a handful of managers at most.
async function managerEmails(admin: SupabaseClient): Promise<string[]> {
	const emails: string[] = [];
	for (let page = 1; page <= 10; page++) {
		const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
		if (error) throw error;
		for (const u of data.users) if (u.email) emails.push(u.email);
		if (data.users.length < 200) break;
	}
	return emails;
}

// Fire-and-forget: sends one email to all managers. Never throws — logs and returns. Callers should
// still wrap in EdgeRuntime.waitUntil so it doesn't block the response.
export async function notifyManagers(admin: SupabaseClient, input: NotifyInput): Promise<void> {
	if (!RESEND_API_KEY) return; // not configured (local/CI) → no-op
	try {
		const to = await managerEmails(admin);
		if (to.length === 0) return;
		const { subject, text, html } = buildEmail(input);
		const res = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${RESEND_API_KEY}`,
				'content-type': 'application/json'
			},
			body: JSON.stringify({ from: FROM, to, subject, text, html })
		});
		if (!res.ok) {
			console.error('notify: resend failed', res.status, await res.text());
		}
	} catch (e) {
		console.error('notify: error', e instanceof Error ? e.message : e);
	}
}
