export type TentStatus = 'active' | 'damaged' | 'out_of_service';
export type DamageStatus = 'open' | 'resolved' | 'invalid';

export interface Category {
	id: string;
	label: string;
	active: boolean;
	sort_order: number;
}

export interface Tent {
	tent_id: number;
	label: string | null;
	out_of_service: boolean;
	acquired_on: string | null;
	notes: string | null;
}

export interface TentWithStatus {
	tent_id: number;
	label: string | null;
	out_of_service: boolean;
	status: TentStatus;
	open_count: number;
}

export interface Damage {
	report_id: string;
	tent_id: number;
	reported_at: string;
	received_at: string;
	category_ids: string[];
	category_labels: string[];
	notes: string | null;
	photo_path: string | null;
	status: DamageStatus;
	resolution_timestamp: string | null;
	resolution_notes: string | null;
	resolved_by: string | null;
}

/** A report queued locally while offline. The photo is kept as a Blob in IndexedDB. */
export interface OutboxReport {
	report_id: string;
	token: string;
	tent_id: number;
	category_ids: string[];
	category_labels: string[];
	notes: string;
	reported_at: string;
	photo: Blob | null;
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
