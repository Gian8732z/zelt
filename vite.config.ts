import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			// Workbox precaches the app shell so the reporter form loads with no network,
			// provided the device opened the app online at least once (cache priming).
			workbox: {
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,webmanifest}'],
				// Keep the ~540 KB lazy three.js chunk (only used by the unshipped /zelt-3d
				// experiment) out of the precache pushed to every reporter phone; it loads from
				// the network on demand instead. A manifestTransform (not
				// maximumFileSizeToCacheInBytes) because the latter emits a workbox warning that
				// vite-plugin-pwa escalates to a build ERROR under CI=true. Every
				// reporter-critical chunk is far below this cap (next-largest is ~390 KB), and
				// the offline-outbox E2E in CI would catch a precache regression if one ever
				// grew past it.
				manifestTransforms: [
					async (entries) => ({
						manifest: entries.filter((e) => e.size <= 500 * 1024),
						warnings: []
					})
				]
			},
			manifest: {
				name: 'Zelt-Verwaltung',
				short_name: 'Zelt',
				description: 'Schadensmeldungen für die Spatz-Zeltflotte',
				lang: 'de',
				theme_color: '#1f6f43',
				background_color: '#ffffff',
				display: 'standalone',
				start_url: '/',
				icons: [
					{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
					{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }
				]
			}
		})
	]
});
