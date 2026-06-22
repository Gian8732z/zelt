<script lang="ts">
	import { onMount } from 'svelte';
	import { getSupabase } from '$lib/supabase';
	import type { Category } from '$lib/types';

	let categories = $state<Category[]>([]);
	let newLabel = $state('');
	let loading = $state(true);
	let errorMsg = $state<string | null>(null);

	async function load() {
		const sb = getSupabase();
		if (!sb) return;
		loading = true;
		errorMsg = null;
		const { data, error } = await sb.from('categories').select('*').order('sort_order');
		loading = false;
		if (error) {
			errorMsg = error.message;
			return;
		}
		categories = (data ?? []) as Category[];
	}

	onMount(load);

	async function add(e: Event) {
		e.preventDefault();
		const sb = getSupabase();
		if (!sb) return;
		const label = newLabel.trim();
		if (!label) return;
		const sort = (categories.at(-1)?.sort_order ?? 0) + 10;
		const { error } = await sb.from('categories').insert({ label, sort_order: sort });
		if (error) {
			errorMsg = error.message;
			return;
		}
		newLabel = '';
		await load();
	}

	async function toggleActive(c: Category) {
		const sb = getSupabase();
		if (!sb) return;
		const { error } = await sb.from('categories').update({ active: !c.active }).eq('id', c.id);
		if (error) {
			errorMsg = error.message;
			return;
		}
		await load();
	}

	async function rename(c: Category) {
		const sb = getSupabase();
		if (!sb) return;
		const label = prompt('Neuer Name:', c.label)?.trim();
		if (!label || label === c.label) return;
		const { error } = await sb.from('categories').update({ label }).eq('id', c.id);
		if (error) {
			errorMsg = error.message;
			return;
		}
		await load();
	}
</script>

<main>
	<h1>Schadenskategorien</h1>
	<p class="muted">
		Melderinnen und Melder wählen aus den aktiven Kategorien. Deaktivierte Kategorien bleiben in
		alten Meldungen erhalten (der Name wird beim Melden mitgespeichert).
	</p>
	{#if errorMsg}<div class="banner err">{errorMsg}</div>{/if}

	<form class="add" onsubmit={add}>
		<input type="text" placeholder="Neue Kategorie" bind:value={newLabel} />
		<button type="submit" disabled={!newLabel.trim()}>Hinzufügen</button>
	</form>

	{#if loading}
		<p class="muted">Laden…</p>
	{:else}
		{#each categories as c (c.id)}
			<div class="card cat-row {c.active ? '' : 'inactive'}">
				<span class="label">{c.label}{c.active ? '' : ' (inaktiv)'}</span>
				<div class="actions">
					<button class="secondary" onclick={() => rename(c)}>Umbenennen</button>
					<button class="secondary" onclick={() => toggleActive(c)}>
						{c.active ? 'Deaktivieren' : 'Aktivieren'}
					</button>
				</div>
			</div>
		{/each}
	{/if}
</main>

<style>
	.add {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	.add button {
		flex: none;
	}
	.cat-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.6rem;
	}
	.cat-row.inactive .label {
		color: var(--text-muted);
	}
	.label {
		font-weight: 600;
	}
	.actions {
		display: flex;
		gap: 0.4rem;
		flex: none;
	}
	.actions button {
		min-height: 40px;
		padding: 0 0.7rem;
	}
</style>
