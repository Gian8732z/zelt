import { describe, it, expect } from 'vitest';
import { severity, SEVERITY_RANK, isValidDamage, snapshotLabel } from './damage-types';

describe('severity', () => {
	it('rates structural / weatherproofing failures hoch', () => {
		for (const [c, k] of [
			['aussenzelt', 'stoff_gerissen'],
			['aussenzelt', 'fehlt'],
			['innenzelt', 'stoff_gerissen'],
			['innenzelt', 'boden_gerissen'],
			['innenzelt', 'fehlt'],
			['stangen', 'verbogen'],
			['stangen', 'fehlt']
		] as const) {
			expect(severity(c, k), `${c}/${k}`).toBe('hoch');
		}
	});

	it('rates a missing peg niedrig (consumable)', () => {
		expect(severity('heringe', 'fehlt')).toBe('niedrig');
	});

	it('rates everything else mittel', () => {
		expect(severity('aussenzelt', 'oese_kaputt')).toBe('mittel');
		expect(severity('vorzelt', 'abspannung_gerissen')).toBe('mittel');
		expect(severity('innenzelt', 'reissverschluss_defekt')).toBe('mittel');
		expect(severity('sonstiges', 'sonstiges')).toBe('mittel');
	});
});

describe('SEVERITY_RANK', () => {
	it('orders hoch < mittel < niedrig (most urgent first)', () => {
		expect(SEVERITY_RANK.hoch).toBeLessThan(SEVERITY_RANK.mittel);
		expect(SEVERITY_RANK.mittel).toBeLessThan(SEVERITY_RANK.niedrig);
	});

	it('sorts a mixed worklist most-urgent-first', () => {
		const rows: ReadonlyArray<readonly [string, string]> = [
			['heringe', 'fehlt'], // niedrig
			['aussenzelt', 'stoff_gerissen'], // hoch
			['vorzelt', 'oese_kaputt'] // mittel
		];
		const sorted = [...rows].sort(
			(a, b) => SEVERITY_RANK[severity(a[0], a[1])] - SEVERITY_RANK[severity(b[0], b[1])]
		);
		expect(sorted.map(([c, k]) => severity(c, k))).toEqual(['hoch', 'mittel', 'niedrig']);
	});
});

describe('isValidDamage', () => {
	it('accepts modes a component actually offers', () => {
		expect(isValidDamage('aussenzelt', 'stoff_gerissen')).toBe(true);
		expect(isValidDamage('heringe', 'fehlt')).toBe(true);
		expect(isValidDamage('innenzelt', 'reissverschluss_defekt')).toBe(true);
	});

	it('accepts the new Abspannung-Haken mode on both Aussenzelt and Vorzelt', () => {
		expect(isValidDamage('aussenzelt', 'abspannung_haken_defekt')).toBe(true);
		expect(isValidDamage('vorzelt', 'abspannung_haken_defekt')).toBe(true);
	});

	it('rejects modes a component does not offer, and unknown components', () => {
		expect(isValidDamage('heringe', 'stoff_gerissen')).toBe(false);
		expect(isValidDamage('stangen', 'oese_kaputt')).toBe(false);
		expect(isValidDamage('nonsense', 'fehlt')).toBe(false);
		expect(isValidDamage('innenzelt', 'abspannung_haken_defekt')).toBe(false);
	});
});

describe('snapshotLabel', () => {
	it('joins component and mode labels with an en dash', () => {
		expect(snapshotLabel('aussenzelt', 'stoff_gerissen')).toBe('Aussenzelt – Stoff gerissen');
		expect(snapshotLabel('stangen', 'verbogen')).toBe('Stangen – verbogen');
		expect(snapshotLabel('aussenzelt', 'abspannung_haken_defekt')).toBe(
			'Aussenzelt – Abspannung Haken defekt'
		);
	});

	it('renders the Sonstiges catch-all without a redundant suffix', () => {
		expect(snapshotLabel('sonstiges', 'sonstiges')).toBe('Sonstiges');
	});

	it('falls back to the raw kind for an unknown pair', () => {
		expect(snapshotLabel('nonsense', 'whatever')).toBe('whatever');
	});
});
