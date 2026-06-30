import { describe, it, expect } from 'vitest';
import { buildTentLabel, labelFileName, LABEL_CTA } from './tent-label';

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
