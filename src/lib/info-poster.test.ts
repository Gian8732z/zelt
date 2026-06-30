import { describe, it, expect } from 'vitest';
import {
	buildInfoPoster,
	posterFileName,
	POSTER_TITLE,
	POSTER_STEPS
} from './info-poster';

describe('buildInfoPoster', () => {
	it('builds the title, general /melden URL, and display caption', () => {
		const p = buildInfoPoster('https://zelt.pages.dev', 'Sola 26');
		expect(p.title).toBe(POSTER_TITLE);
		expect(p.url).toBe('https://zelt.pages.dev/melden');
		expect(p.urlDisplay).toBe('zelt.pages.dev/melden');
		expect(p.steps).toEqual(POSTER_STEPS);
	});

	it('puts the camp name into the footer after Gromit', () => {
		expect(buildInfoPoster('https://zelt.pages.dev', 'Sola 26').footer).toBe('Gromit · Sola 26');
	});

	it('omits the separator when the camp is blank', () => {
		expect(buildInfoPoster('https://zelt.pages.dev', '   ').footer).toBe('Gromit');
	});

	it('tolerates a trailing slash on the origin', () => {
		expect(buildInfoPoster('https://zelt.pages.dev/', 'Sola 26').url).toBe(
			'https://zelt.pages.dev/melden'
		);
	});

	it('strips http as well as https for the display caption', () => {
		expect(buildInfoPoster('http://localhost:5173', '').urlDisplay).toBe('localhost:5173/melden');
	});
});

describe('posterFileName', () => {
	it('slugifies the camp name', () => {
		expect(posterFileName('Sola 26')).toBe('zelt-info-sola-26.pdf');
	});

	it('collapses punctuation and trims dashes', () => {
		expect(posterFileName('  Pfila/Herbst 2026!  ')).toBe('zelt-info-pfila-herbst-2026.pdf');
	});

	it('falls back to a generic name when the camp is blank', () => {
		expect(posterFileName('   ')).toBe('zelt-info.pdf');
	});
});
