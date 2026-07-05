// Sub-part map for the 3D tent model (Tent3D.svelte): every tappable piece of geometry is a
// SubPartKey, and each key points at the (component, damage_kind) it suggests in the report menu
// — kind: null means "opens the component menu with nothing preselected" (fabric surfaces, poles,
// pegs: the likely mode is ambiguous). The reverse direction drives the damage DISPLAY: an open
// (component, kind) tints exactly its sub-part; component-level kinds (stoff_gerissen, sonstiges)
// tint the fabric; `fehlt` ghosts every sub-part of the component (the whole part is gone).
// Pure logic, no three.js import — unit-tested in parts.test.ts against damage-types.ts so the
// geometry can never point at a (component, kind) pair the taxonomy doesn't accept.
import type { ComponentKey, DamageKind } from '../damage-types';
import type { OpenDamage } from '../tent-info';

export type SubPartKey =
	| 'aussenzelt_stoff'
	| 'aussenzelt_abspannung'
	| 'aussenzelt_haken'
	| 'aussenzelt_oesen'
	| 'vorzelt_stoff'
	| 'vorzelt_abspannung'
	| 'vorzelt_haken'
	| 'vorzelt_oesen'
	| 'innenzelt_stoff'
	| 'innenzelt_boden'
	| 'innenzelt_reissverschluss'
	| 'innenzelt_aufhaengung'
	| 'innenzelt_schnuere'
	| 'stangen'
	| 'heringe';

export type Severity = 'damaged' | 'missing';

export interface SubPartTarget {
	component: ComponentKey;
	/** The damage mode this sub-part suggests, or null when only the component is implied. */
	kind: DamageKind | null;
}

export const SUBPART_TARGETS: Record<SubPartKey, SubPartTarget> = {
	aussenzelt_stoff: { component: 'aussenzelt', kind: null },
	aussenzelt_abspannung: { component: 'aussenzelt', kind: 'abspannung_gerissen' },
	aussenzelt_haken: { component: 'aussenzelt', kind: 'abspannung_haken_defekt' },
	aussenzelt_oesen: { component: 'aussenzelt', kind: 'oese_kaputt' },
	vorzelt_stoff: { component: 'vorzelt', kind: null },
	vorzelt_abspannung: { component: 'vorzelt', kind: 'abspannung_gerissen' },
	vorzelt_haken: { component: 'vorzelt', kind: 'abspannung_haken_defekt' },
	vorzelt_oesen: { component: 'vorzelt', kind: 'oese_kaputt' },
	innenzelt_stoff: { component: 'innenzelt', kind: null },
	innenzelt_boden: { component: 'innenzelt', kind: 'boden_gerissen' },
	innenzelt_reissverschluss: { component: 'innenzelt', kind: 'reissverschluss_defekt' },
	innenzelt_aufhaengung: { component: 'innenzelt', kind: 'aufhaengung_gerissen' },
	innenzelt_schnuere: { component: 'innenzelt', kind: 'schnur_aussenzelt_gerissen' },
	stangen: { component: 'stangen', kind: null },
	heringe: { component: 'heringe', kind: null }
};

export const SUBPART_LABELS: Record<SubPartKey, string> = {
	aussenzelt_stoff: 'Aussenzelt',
	aussenzelt_abspannung: 'Abspannung (Aussenzelt)',
	aussenzelt_haken: 'Abspannung-Haken (Aussenzelt)',
	aussenzelt_oesen: 'Ösen (Aussenzelt)',
	vorzelt_stoff: 'Vorzelt',
	vorzelt_abspannung: 'Abspannung (Vorzelt)',
	vorzelt_haken: 'Abspannung-Haken (Vorzelt)',
	vorzelt_oesen: 'Ösen (Vorzelt)',
	innenzelt_stoff: 'Innenzelt',
	innenzelt_boden: 'Boden (Innenzelt)',
	innenzelt_reissverschluss: 'Reissverschluss (Innenzelt)',
	innenzelt_aufhaengung: 'Aufhängung (Innenzelt)',
	innenzelt_schnuere: 'Schnur zum Aussenzelt (Innenzelt)',
	stangen: 'Stangen',
	heringe: 'Heringe'
};

export const ALL_SUBPARTS = Object.keys(SUBPART_TARGETS) as SubPartKey[];

/** Sub-parts hidden inside/under the Aussenzelt — visible only in the x-ray view. */
export const INTERIOR_SUBPARTS: ReadonlySet<SubPartKey> = new Set<SubPartKey>([
	'innenzelt_stoff',
	'innenzelt_boden',
	'innenzelt_reissverschluss',
	'innenzelt_aufhaengung',
	'innenzelt_schnuere'
]);

/** The exterior fabric shells that occlude the interior — the x-ray view ghosts exactly these.
 *  Lives here (not in the WebGL code) so the sync tests can hold it against INTERIOR_SUBPARTS. */
export const SHELL_SUBPARTS: ReadonlySet<SubPartKey> = new Set<SubPartKey>([
	'aussenzelt_stoff',
	'vorzelt_stoff'
]);

const byComponent = new Map<ComponentKey, SubPartKey[]>();
const byPair = new Map<string, SubPartKey>();
for (const key of ALL_SUBPARTS) {
	const t = SUBPART_TARGETS[key];
	byComponent.set(t.component, [...(byComponent.get(t.component) ?? []), key]);
	if (t.kind) byPair.set(`${t.component}/${t.kind}`, key);
}

export function subPartsForComponent(component: string): SubPartKey[] {
	return byComponent.get(component as ComponentKey) ?? [];
}

/** The fabric/body sub-part of a component — the target for component-level damage kinds. */
function bodySubPart(component: string): SubPartKey | null {
	return subPartsForComponent(component).find((k) => SUBPART_TARGETS[k].kind === null) ?? null;
}

/** Worst severity per sub-part, derived from the open damages. Missing beats damaged.
 *  - `fehlt` ghosts every sub-part of its component (the whole part is gone).
 *  - A kind with a mapped sub-part tints exactly that sub-part.
 *  - Component-level kinds (stoff_gerissen, sonstiges, verbogen, …) tint the body sub-part.
 *  - The catch-all `sonstiges` component has no geometry and is ignored. */
export function computeSubPartStates(open: OpenDamage[]): Partial<Record<SubPartKey, Severity>> {
	const out: Partial<Record<SubPartKey, Severity>> = {};
	const mark = (key: SubPartKey | null, sev: Severity) => {
		if (!key || out[key] === 'missing') return;
		if (sev === 'missing' || !out[key]) out[key] = sev;
	};
	for (const d of open) {
		if (d.damage_kind === 'fehlt') {
			for (const key of subPartsForComponent(d.component)) mark(key, 'missing');
			continue;
		}
		const mapped = byPair.get(`${d.component}/${d.damage_kind}`);
		mark(mapped ?? bodySubPart(d.component), 'damaged');
	}
	return out;
}

/** True when any open damage sits on an interior sub-part — the page auto-enables x-ray then. */
export function hasInteriorDamage(open: OpenDamage[]): boolean {
	const states = computeSubPartStates(open);
	return ALL_SUBPARTS.some((k) => states[k] && INTERIOR_SUBPARTS.has(k));
}
