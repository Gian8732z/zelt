import { defineConfig } from 'vitest/config';

// Unit tests only: pure logic in src/lib (no DOM, no SvelteKit runtime). The browser-level
// flows live under /e2e and run with Playwright, not here. A dedicated vitest config keeps
// the SvelteKit plugin (vite.config.ts) out of the unit-test path.
export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
