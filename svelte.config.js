import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// SPA mode: the fallback shell is served for every route, so a deep-linked reporter
		// URL (/melden/<token>) still loads from the Service-Worker cache while offline.
		adapter: adapter({ fallback: 'index.html' })
	}
};

export default config;
