export type TentStatus = 'active' | 'damaged' | 'out_of_service';
export type DamageStatus = 'open' | 'resolved' | 'invalid';

export interface Tent {
	tent_id: number;
	label: string | null;
	camp_group: string | null;
	out_of_service: boolean;
	retired: boolean;
	acquired_on: string | null;
	notes: string | null;
}

export interface TentWithStatus {
	tent_id: number;
	label: string | null;
	camp_group: string | null;
	out_of_service: boolean;
	status: TentStatus;
	open_count: number;
}

export interface Damage {
	report_id: string;
	tent_id: number;
	reported_at: string;
	received_at: string;
	component: string | null;
	damage_kind: string | null;
	quantity: number | null;
	category_ids: string[];
	category_labels: string[];
	notes: string | null;
	photo_path: string | null;
	reporter_name: string | null; // who filed the report (captured in the reporter form)
	camp: string | null;          // which camp it was filed at (server-stamped from CURRENT_CAMP)
	status: DamageStatus;
	resolution_timestamp: string | null;
	resolution_notes: string | null;
	resolved_by: string | null;
}

/** One selected damage within a submission: a (component, damage_kind) pair. Each becomes its own
 *  append-only `damages` row, independently resolvable. `report_id` is the per-row idempotency key.
 *  Photo and free-text comment are per-item: each damage carries its own evidence. */
export interface DamageItem {
	report_id: string;
	component: string;
	damage_kind: string;
	label: string;            // German snapshot label, frozen at submit time ("Vorzelt – fehlt")
	quantity: number | null;  // only for countable modes (Heringe, Abspannung, Öse, …)
	description: string | null; // per-item free text ("Bemerkung"); required for Sonstiges
	photo: Blob | null;       // per-item photo, kept in IndexedDB; uploaded as <report_id>.jpg
}

/** A submission queued locally while offline. One submission groups several damage items, each
 *  carrying its own optional photo Blob (kept in IndexedDB). The camp is NOT carried here — it is
 *  stamped server-side from CURRENT_CAMP at insert time. */
export interface OutboxReport {
	submission_id: string;
	token: string;
	tent_id: number;
	reporter_name: string;
	items: DamageItem[];
	reported_at: string;
	queued_at: number;
}

export const TENT_STATUS_LABELS: Record<TentStatus, string> = {
	active: 'In Ordnung',
	damaged: 'Reparatur nötig',
	out_of_service: 'Ausser Betrieb'
};

export const DAMAGE_STATUS_LABELS: Record<DamageStatus, string> = {
	open: 'Offen',
	resolved: 'Erledigt',
	invalid: 'Ungültig'
};
