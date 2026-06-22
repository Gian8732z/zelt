<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { flushOutbox } from '$lib/submit';

	let { children } = $props();

	onMount(() => {
		(async () => {
			try {
				const { registerSW } = await import('virtual:pwa-register');
				registerSW({ immediate: true });
			} catch {
				// PWA plugin inactive (e.g. plain dev server) — fine, SW just isn't registered.
			}
		})();

		// Drain any reports queued offline: once now, and again whenever connectivity returns.
		// (iOS Safari has no Background Sync API, so this foreground flush is the baseline.)
		flushOutbox().catch(() => {});
		const onOnline = () => flushOutbox().catch(() => {});
		window.addEventListener('online', onOnline);
		return () => window.removeEventListener('online', onOnline);
	});
</script>

{@render children()}
