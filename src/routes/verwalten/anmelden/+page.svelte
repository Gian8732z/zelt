<script lang="ts">
	import { goto } from '$app/navigation';
	import { getSupabase } from '$lib/supabase';

	let email = $state('');
	let password = $state('');
	let busy = $state(false);
	let errorMsg = $state<string | null>(null);

	async function login(e: Event) {
		e.preventDefault();
		const sb = getSupabase();
		if (!sb) return;
		busy = true;
		errorMsg = null;
		const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
		busy = false;
		if (error) {
			errorMsg = 'Anmeldung fehlgeschlagen. E-Mail oder Passwort falsch.';
			return;
		}
		goto('/verwalten');
	}
</script>

<main>
	<h1>Verwaltung – Anmeldung</h1>
	{#if errorMsg}<div class="banner err">{errorMsg}</div>{/if}
	<form onsubmit={login}>
		<label for="email">E-Mail</label>
		<input id="email" type="email" autocomplete="username" bind:value={email} required />
		<div style="height: 1rem;"></div>
		<label for="pw">Passwort</label>
		<input id="pw" type="password" autocomplete="current-password" bind:value={password} required />
		<div style="margin-top: 1.5rem;">
			<button class="full" type="submit" disabled={busy}>{busy ? 'Anmelden…' : 'Anmelden'}</button>
		</div>
	</form>
	<p class="muted" style="margin-top: 1rem;">Konten werden vom Administrator angelegt.</p>
</main>
