import { FUNCTIONS_URL, SUPABASE_ANON_KEY, REPORTER_TOKEN } from './config';
import type { TentStatus } from './types';

export interface OpenDamage {
	component: string;
	damage_kind: string;
	label: string;
	quantity: number | null;
	description: string | null;
	reported_at: string;
}

export interface TentInfo {
	tent_id: number;
	label: string | null;
	status: TentStatus;
	open: OpenDamage[];
}

/** Read one tent's status + open damages via the token-gated `zelt-info` Edge Function. The
 *  reporter token is the bundled one (no longer carried in the URL). */
export async function fetchTentInfo(tentId: number): Promise<TentInfo> {
	const res = await fetch(`${FUNCTIONS_URL}/zelt-info`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			// The anon key satisfies the Supabase platform; the real gate is the reporter token.
			Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
			apikey: SUPABASE_ANON_KEY
		},
		body: JSON.stringify({ token: REPORTER_TOKEN, tent_id: tentId })
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(body.error === 'unauthorized' ? 'unauthorized' : `status_${res.status}`);
	}
	return (await res.json()) as TentInfo;
}
