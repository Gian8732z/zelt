// Maps damage components onto the three fabric regions the tent diagram (TentModel.svelte) can
// highlight. Only Aussenzelt / Innenzelt / Vorzelt carry overlay vectors; the other components
// (Stangen, Heringe, Sonstiges) have no region and render as text only in the open-damage list.
// A part lights up amber when damaged and red when missing (damage_kind === 'fehlt'); missing
// outranks damaged.
import type { OpenDamage } from './tent-info';

export type PartKey = 'aussenzelt' | 'innenzelt' | 'vorzelt';

export type Severity = 'damaged' | 'missing';

const PARTS = new Set<PartKey>(['aussenzelt', 'innenzelt', 'vorzelt']);

export const PART_LABELS: Record<PartKey, string> = {
	aussenzelt: 'Aussenzelt',
	innenzelt: 'Innenzelt',
	vorzelt: 'Vorzelt'
};

/** The component key is the part key for the three fabric regions; everything else has no part. */
export function partForComponent(component: string): PartKey | null {
	return PARTS.has(component as PartKey) ? (component as PartKey) : null;
}

/** Worst severity present per part, derived from the open damages. Missing beats damaged. */
export function computePartStates(open: OpenDamage[]): Partial<Record<PartKey, Severity>> {
	const out: Partial<Record<PartKey, Severity>> = {};
	for (const d of open) {
		const part = partForComponent(d.component);
		if (!part || out[part] === 'missing') continue;
		const sev: Severity = d.damage_kind === 'fehlt' ? 'missing' : 'damaged';
		if (sev === 'missing' || !out[part]) out[part] = sev;
	}
	return out;
}
