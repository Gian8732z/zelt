<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { getSupabase } from '$lib/supabase';
	import { isConfigured } from '$lib/config';

	let { children } = $props();
	let ready = $state(false);
	let email = $state<string | null>(null);

	const onLogin = $derived($page.url.pathname.endsWith('/anmelden'));

	onMount(() => {
		const sb = getSupabase();
		if (!sb) {
			ready = true;
			return;
		}
		sb.auth.getSession().then(({ data }) => {
			email = data.session?.user.email ?? null;
			ready = true;
			if (!data.session && !location.pathname.endsWith('/anmelden')) goto('/verwalten/anmelden');
		});
		const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
			email = session?.user.email ?? null;
			if (!session && !location.pathname.endsWith('/anmelden')) goto('/verwalten/anmelden');
		});
		return () => sub.subscription.unsubscribe();
	});

	async function signOut() {
		await getSupabase()?.auth.signOut();
		email = null;
		goto('/verwalten/anmelden');
	}
</script>

{#if !isConfigured}
	<main>
		<div class="banner warn">
			Supabase ist nicht konfiguriert. Lege eine <code>.env</code> nach dem Muster von
			<code>.env.example</code> an.
		</div>
	</main>
{:else if !ready}
	<main><p class="muted">Laden…</p></main>
{:else}
	{#if email}
		<header class="topbar">
			<nav>
				<a href="/verwalten">Flotte</a>
			</nav>
			<button class="secondary" onclick={signOut}>Abmelden</button>
		</header>
	{/if}
	{#if onLogin || email}
		{@render children()}
	{:else}
		<main><p class="muted">Weiterleitung…</p></main>
	{/if}
{/if}

<style>
	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.5rem 1rem;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	.topbar nav {
		display: flex;
		gap: 1rem;
	}
	.topbar nav a {
		font-weight: 600;
		text-decoration: none;
		padding: 0.5rem 0;
	}
	.topbar button {
		min-height: 40px;
		padding: 0 0.9rem;
	}
</style>
