// Fleet roster helpers: picking the next tent number and validating a manager-entered one.
// tent_id is a meaningful integer (printed on the physical QR sticker, shown as the tile number),
// so new IDs are manager-chosen — defaulted to the next free number but collision-checked against
// EVERY existing tent, including retired ones whose ID stays reserved by their history.

export const MAX_TENT_ID = 999; // mirrors the melden function's tent_id upper bound

/** The default for a new tent: one past the highest existing id (1 for an empty fleet). */
export function nextTentId(existingIds: number[]): number {
	return existingIds.length ? Math.max(...existingIds) + 1 : 1;
}

/** Validate a manager-entered tent number against the existing roster (active + retired).
 *  Returns a German error message, or null when the id is acceptable. */
export function validateNewTentId(id: number, existingIds: number[]): string | null {
	if (!Number.isInteger(id)) return 'Bitte eine ganze Zahl eingeben.';
	if (id < 1 || id > MAX_TENT_ID) return `Nummer muss zwischen 1 und ${MAX_TENT_ID} liegen.`;
	if (existingIds.includes(id)) return `Zelt ${id} existiert bereits.`;
	return null;
}

/** A tent may be hard-deleted only when it has no damage history; otherwise it must be retired,
 *  so the append-only log (and seasonal stats) survive. */
export function canHardDelete(damageCount: number): boolean {
	return damageCount === 0;
}
