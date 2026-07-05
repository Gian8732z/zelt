import { describe, expect, it } from 'vitest';
import { COMPONENTS, componentDef, isValidDamage, snapshotLabel } from '../damage-types';
import type { OpenDamage } from '../tent-info';
import {
	ALL_SUBPARTS,
	INTERIOR_SUBPARTS,
	SUBPART_LABELS,
	SUBPART_TARGETS,
	computeSubPartStates,
	hasInteriorDamage,
	subPartsForComponent
} from './parts';

function dmg(component: string, kind: string, quantity: number | null = null): OpenDamage {
	return {
		component,
		damage_kind: kind,
		label: snapshotLabel(component, kind),
		quantity,
		description: null,
		reported_at: ''
	};
}

describe('SUBPART_TARGETS stays in sync with the damage taxonomy', () => {
	it('every mode-mapped sub-part points at a valid (component, kind) pair', () => {
		for (const key of ALL_SUBPARTS) {
			const t = SUBPART_TARGETS[key];
			if (t.kind) expect(isValidDamage(t.component, t.kind), `${key} → ${t.component}/${t.kind}`).toBe(true);
		}
	});

	it('every sub-part component exists in the taxonomy', () => {
		for (const key of ALL_SUBPARTS) {
			expect(componentDef(SUBPART_TARGETS[key].component), key).toBeDefined();
		}
	});

	it('every physical component has geometry (only the catch-all sonstiges has none)', () => {
		for (const c of COMPONENTS) {
			if (c.component === 'sonstiges') expect(subPartsForComponent(c.component)).toEqual([]);
			else expect(subPartsForComponent(c.component).length, c.component).toBeGreaterThan(0);
		}
	});

	it('no two sub-parts claim the same (component, kind) pair', () => {
		const seen = new Set<string>();
		for (const key of ALL_SUBPARTS) {
			const t = SUBPART_TARGETS[key];
			if (!t.kind) continue;
			const pair = `${t.component}/${t.kind}`;
			expect(seen.has(pair), pair).toBe(false);
			seen.add(pair);
		}
	});

	it('every sub-part has a German label', () => {
		for (const key of ALL_SUBPARTS) expect(SUBPART_LABELS[key]).toBeTruthy();
	});
});

describe('computeSubPartStates', () => {
	it('empty damages → no states', () => {
		expect(computeSubPartStates([])).toEqual({});
	});

	it('a mode-mapped damage tints exactly its sub-part', () => {
		const states = computeSubPartStates([dmg('aussenzelt', 'abspannung_gerissen', 2)]);
		expect(states).toEqual({ aussenzelt_abspannung: 'damaged' });
	});

	it('component-level kinds tint the body sub-part', () => {
		expect(computeSubPartStates([dmg('vorzelt', 'stoff_gerissen')])).toEqual({
			vorzelt_stoff: 'damaged'
		});
		expect(computeSubPartStates([dmg('aussenzelt', 'sonstiges')])).toEqual({
			aussenzelt_stoff: 'damaged'
		});
		expect(computeSubPartStates([dmg('stangen', 'verbogen')])).toEqual({ stangen: 'damaged' });
	});

	it('fehlt ghosts every sub-part of the component', () => {
		const states = computeSubPartStates([dmg('vorzelt', 'fehlt')]);
		expect(states).toEqual({
			vorzelt_stoff: 'missing',
			vorzelt_abspannung: 'missing',
			vorzelt_haken: 'missing',
			vorzelt_oesen: 'missing'
		});
	});

	it('missing outranks damaged on the same sub-part', () => {
		const states = computeSubPartStates([
			dmg('heringe', 'fehlt', 3),
			dmg('aussenzelt', 'oese_kaputt', 1),
			dmg('aussenzelt', 'fehlt')
		]);
		expect(states.heringe).toBe('missing');
		expect(states.aussenzelt_oesen).toBe('missing'); // fehlt spread wins over the öse tint
	});

	it('the catch-all sonstiges component is ignored (no geometry)', () => {
		expect(computeSubPartStates([dmg('sonstiges', 'sonstiges')])).toEqual({});
	});

	it('interior kinds land on interior sub-parts', () => {
		const states = computeSubPartStates([
			dmg('innenzelt', 'boden_gerissen'),
			dmg('innenzelt', 'reissverschluss_defekt'),
			dmg('innenzelt', 'aufhaengung_gerissen'),
			dmg('innenzelt', 'schnur_aussenzelt_gerissen', 4)
		]);
		expect(states).toEqual({
			innenzelt_boden: 'damaged',
			innenzelt_reissverschluss: 'damaged',
			innenzelt_aufhaengung: 'damaged',
			innenzelt_schnuere: 'damaged'
		});
		for (const key of Object.keys(states)) {
			expect(INTERIOR_SUBPARTS.has(key as never), key).toBe(true);
		}
	});
});

describe('hasInteriorDamage', () => {
	it('true only when an interior sub-part carries damage', () => {
		expect(hasInteriorDamage([])).toBe(false);
		expect(hasInteriorDamage([dmg('aussenzelt', 'stoff_gerissen')])).toBe(false);
		expect(hasInteriorDamage([dmg('heringe', 'fehlt', 2)])).toBe(false);
		expect(hasInteriorDamage([dmg('innenzelt', 'stoff_gerissen')])).toBe(true);
		expect(hasInteriorDamage([dmg('innenzelt', 'fehlt')])).toBe(true);
	});
});
