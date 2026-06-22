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
				globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,webmanifest}']
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
