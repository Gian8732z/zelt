<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getSupabase } from '$lib/supabase';
	import { isConfigured } from '$lib/config';
	import { groupTents, type TentGroupRow, type TentSection } from '$lib/camp-groups';

	// Fallback entry for the single shared QR / link: the reporter picks the tent manually, then
	// continues to that tent's page (the canonical per-tent flow). Per-tent QR codes skip this step.
	// No token in the URL anymore — the per-tent page carries the bundled reporter token itself.
	// The camp layout (which group each tent is in, and which are stored away) comes from the
	// anon-readable `tent_groups` view; we cache it so a later offline open still renders the camp.
	interface PickerTent extends TentGroupRow {
		out_of_service: boolean;
	}

	const CACHE_KEY = 'zelt:tent_groups';
	const FLAT_TENTS = Array.from({ length: 20 }, (_, i) => i + 1);

	let sections = $state<TentSection<PickerTent>[] | null>(null);
	let flat = $state(false); // cold-cache offline fallback: plain, all-clickable 1..20
	let loading = $state(true);

	function readCache(): PickerTent[] | null {
		try {
			const raw = localStorage.getItem(CACHE_KEY);
			const rows = raw ? JSON.parse(raw) : null;
			return Array.isArray(rows) && rows.length ? (rows as PickerTent[]) : null;
		} catch {
			return null;
		}
	}

	function writeCache(rows: PickerTent[]) {
		try {
			localStorage.setItem(CACHE_KEY, JSON.stringify(rows));
		} catch {
			/* storage disabled / full — non-fatal, the picker still works while online */
		}
	}

	onMount(async () => {
		let rows: PickerTent[] | null = null;
		const sb = getSupabase();
		if (sb) {
			const { data, error } = await sb
				.from('tent_groups')
				.select('tent_id, camp_group, out_of_service')
				.order('tent_id');
			if (!error && data) {
				rows = data as PickerTent[];
				writeCache(rows);
			}
		}
		if (!rows) rows = readCache(); // offline / read failed → last known camp layout
		if (rows) sections = groupTents(rows);
		else flat = true; // cold cache offline → never block reporting
		loading = false;
	});

	function pick(n: number) {
		goto(`/zelt/${n}`);
	}
</script>

<main>
	<h1>Schaden melden</h1>

	{#if !isConfigured}
		<div class="banner warn">App ist noch nicht mit der Datenbank verbunden (Supabase fehlt).</div>
	{/if}

	<h2 class="lead">Welches Zelt?</h2>
	<p class="muted">Wähle das Zelt, das du melden möchtest.</p>

	{#if loading}
		<p class="muted">Laden…</p>
	{:else if flat}
		<div class="tent-grid">
			{#each FLAT_TENTS as n}
				<button type="button" class="tent secondary" onclick={() => pick(n)}>{n}</button>
			{/each}
		</div>
	{:else if sections}
		{#each sections as section (section.name)}
			<section class="group">
				<h3 class:inactive={section.inactive}>{section.name}</h3>
				<div class="tent-grid">
					{#each section.tents as t (t.tent_id)}
						{#if t.out_of_service}
							<span class="tent disabled" aria-disabled="true">{t.tent_id}</span>
						{:else}
							<button type="button" class="tent secondary" onclick={() => pick(t.tent_id)}>
								{t.tent_id}
							</button>
						{/if}
					{/each}
				</div>
			</section>
		{/each}
	{/if}
</main>

<style>
	.lead {
		margin-bottom: 0.25rem;
	}
	.group {
		margin-top: 1.25rem;
	}
	.group h3 {
		margin: 0 0 0.5rem;
		font-size: 1rem;
	}
	.group h3.inactive {
		color: var(--text-muted);
		font-weight: 600;
	}
	.tent-grid {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 0.5rem;
	}
	.tent {
		min-height: 56px;
		padding: 0;
		font-size: 1.1rem;
		font-weight: 700;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.tent.disabled {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
		opacity: 0.55;
		cursor: not-allowed;
	}
</style>
