// Component-first structured damage taxonomy for the Spatz tent.
// The reporter first picks a COMPONENT (Aussenzelt, Vorzelt, …), then one or more DAMAGE MODES
// from that component's own menu. `damage_kind` keys are a shared vocabulary; each component
// offers a curated subset (some cord-tear modes are named per component). Each selected
// (component, kind) becomes one append-only `damages` row, independently resolvable. Component +
// damage_kind are stored as separate columns; the German label is snapshotted onto the row at
// submit time (category_labels), so relabelling here never rewrites history.

export type DamageInput = 'none' | 'count'; // 'count' => carries an Anzahl (quantity)

export type ComponentKey =
	| 'aussenzelt'
	| 'innenzelt'
	| 'vorzelt'
	| 'stangen'
	| 'heringe'
	| 'sonstiges';

export type DamageKind =
	| 'stoff_gerissen'
	| 'abspannung_gerissen'
	| 'aufhaengung_gerissen'
	| 'schnur_aussenzelt_gerissen'
	| 'oese_kaputt'
	| 'reissverschluss_defekt'
	| 'boden_gerissen'
	| 'verbogen'
	| 'fehlt'
	| 'sonstiges';

export interface DamageMode {
	kind: DamageKind;
	label: string;
	input: DamageInput;
	exclusive?: boolean; // `fehlt`: the whole part is gone, so it can't combine with other modes
	// Every selected damage now carries an optional free-text "Bemerkung" (stored in the row's
	// `notes`/`description`). `Sonstiges` is the one mode where that comment is mandatory — a bare
	// "Sonstiges" with no description is meaningless.
	commentRequired?: boolean;
}

export interface Component {
	component: ComponentKey;
	label: string;
	modes: DamageMode[];
}

// Shared mode constructors so the per-component menus read as curated subsets of one vocabulary.
const STOFF: DamageMode = { kind: 'stoff_gerissen', label: 'Stoff gerissen', input: 'none' };
const ABSPANNUNG: DamageMode = { kind: 'abspannung_gerissen', label: 'Abspannung gerissen', input: 'count' };
const AUFHAENGUNG: DamageMode = { kind: 'aufhaengung_gerissen', label: 'Aufhängung gerissen', input: 'count' };
const SCHNUR_AUSSEN: DamageMode = { kind: 'schnur_aussenzelt_gerissen', label: 'Schnur-Aussenzelt gerissen', input: 'count' };
const OESE: DamageMode = { kind: 'oese_kaputt', label: 'Öse kaputt', input: 'count' };
const REISSVERSCHLUSS: DamageMode = { kind: 'reissverschluss_defekt', label: 'Reissverschluss defekt', input: 'none' };
const BODEN: DamageMode = { kind: 'boden_gerissen', label: 'Boden gerissen', input: 'none' };
const VERBOGEN: DamageMode = { kind: 'verbogen', label: 'verbogen', input: 'none' };
const SONSTIGES: DamageMode = { kind: 'sonstiges', label: 'Sonstiges', input: 'none', commentRequired: true };
const fehlt = (input: DamageInput = 'none'): DamageMode => ({ kind: 'fehlt', label: 'fehlt', input, exclusive: true });

export const COMPONENTS: Component[] = [
	{ component: 'aussenzelt', label: 'Aussenzelt', modes: [STOFF, ABSPANNUNG, OESE, fehlt(), SONSTIGES] },
	{ component: 'innenzelt', label: 'Innenzelt', modes: [STOFF, AUFHAENGUNG, SCHNUR_AUSSEN, REISSVERSCHLUSS, BODEN, fehlt(), SONSTIGES] },
	{ component: 'vorzelt', label: 'Vorzelt', modes: [STOFF, ABSPANNUNG, OESE, fehlt(), SONSTIGES] },
	{ component: 'stangen', label: 'Stangen', modes: [VERBOGEN, fehlt()] },
	{ component: 'heringe', label: 'Heringe', modes: [fehlt('count')] },
	{ component: 'sonstiges', label: 'Sonstiges', modes: [SONSTIGES] }
];

const BY_COMPONENT = new Map(COMPONENTS.map((c) => [c.component, c]));

export function componentDef(component: string): Component | undefined {
	return BY_COMPONENT.get(component as ComponentKey);
}

export function damageMode(component: string, kind: string): DamageMode | undefined {
	return componentDef(component)?.modes.find((m) => m.kind === kind);
}

/** German label snapshotted onto each row, e.g. "Vorzelt – Stoff gerissen". The catch-all
 *  Sonstiges component renders as just "Sonstiges" (no redundant "Sonstiges – Sonstiges"). */
export function snapshotLabel(component: string, kind: string): string {
	const c = componentDef(component);
	const m = c?.modes.find((x) => x.kind === kind);
	if (!c || !m) return kind;
	return component === 'sonstiges' ? c.label : `${c.label} – ${m.label}`;
}

/** Server- and client-shared validity check for a (component, damage_kind) pair. */
export function isValidDamage(component: string, kind: string): boolean {
	return !!damageMode(component, kind);
}
