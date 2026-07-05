import { describe, it, expect } from 'vitest';
import {
	buildTentLabel,
	labelFileName,
	LABEL_CTA,
	inCampLabelTentIds,
	ALL_LABELS_FILE_NAME
} from './tent-label';

describe('buildTentLabel', () => {
	it('builds the title, reporter URL, and display fallback', () => {
		const label = buildTentLabel(1, 'https://zelt.pages.dev');
		expect(label.title).toBe('Zelt 1');
		expect(label.url).toBe('https://zelt.pages.dev/zelt/1');
		expect(label.urlDisplay).toBe('zelt.pages.dev/zelt/1');
		expect(label.cta).toBe(LABEL_CTA);
	});

	it('tolerates a trailing slash on the origin', () => {
		expect(buildTentLabel(7, 'https://zelt.pages.dev/').url).toBe('https://zelt.pages.dev/zelt/7');
	});

	it('strips http as well as https for the display fallback', () => {
		expect(buildTentLabel(3, 'http://localhost:5173').urlDisplay).toBe('localhost:5173/zelt/3');
	});

	it('targets the token-less canonical reporter path', () => {
		expect(buildTentLabel(20, 'https://zelt.pages.dev').url).toMatch(/\/zelt\/20$/);
	});
});

describe('labelFileName', () => {
	it('zero-pads the tent number to match the QR script', () => {
		expect(labelFileName(1)).toBe('zelt-01-label.pdf');
		expect(labelFileName(20)).toBe('zelt-20-label.pdf');
	});
});

describe('inCampLabelTentIds', () => {
	it('keeps only in-camp tents (not out-of-service, not retired), sorted by number', () => {
		const rows = [
			{ tent_id: 3, out_of_service: false, retired: false },
			{ tent_id: 1, out_of_service: false, retired: false },
			{ tent_id: 2, out_of_service: true, retired: false }, // stored / not in camp
			{ tent_id: 4, out_of_service: false, retired: true } // retired
		];
		expect(inCampLabelTentIds(rows)).toEqual([1, 3]);
	});

	it('treats a missing retired flag as not retired', () => {
		expect(inCampLabelTentIds([{ tent_id: 5, out_of_service: false }])).toEqual([5]);
	});

	it('returns an empty list when no tent is in the camp', () => {
		expect(inCampLabelTentIds([{ tent_id: 1, out_of_service: true, retired: false }])).toEqual([]);
	});
});

describe('ALL_LABELS_FILE_NAME', () => {
	it('is the bulk sheet filename', () => {
		expect(ALL_LABELS_FILE_NAME).toBe('zelt-etiketten.pdf');
	});
});
