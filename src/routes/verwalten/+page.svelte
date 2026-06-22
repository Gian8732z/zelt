<script lang="ts">
	import { onMount } from 'svelte';
	import { getSupabase } from '$lib/supabase';
	import { TENT_STATUS_LABELS, type TentWithStatus } from '$lib/types';

	let tents = $state<TentWithStatus[]>([]);
	let loading = $state(true);
	let errorMsg = $state<string | null>(null);

	async function load() {
		const sb = getSupabase();
		if (!sb) return;
		loading = true;
		errorMsg = null;
		const { data, error } = await sb.from('tent_overview').select('*').order('tent_id');
		loading = false;
		if (error) {
			errorMsg = error.message;
			return;
		}
		tents = (data ?? []) as TentWithStatus[];
	}

	onMount(load);
</script>

<main>
	<h1>Flotte</h1>
	{#if errorMsg}<div class="banner err">{errorMsg}</div>{/if}
	{#if loading}
		<p class="muted">Laden…</p>
	{:else}
		<div class="legend">
			<span><i class="dot active"></i> {TENT_STATUS_LABELS.active}</span>
			<span><i class="dot damaged"></i> {TENT_STATUS_LABELS.damaged}</span>
			<span><i class="dot out_of_service"></i> {TENT_STATUS_LABELS.out_of_service}</span>
		</div>
		<div class="grid">
			{#each tents as t (t.tent_id)}
				<a class="tile {t.status}" href={`/verwalten/zelt/${t.tent_id}`}>
					<span class="num">{t.tent_id}</span>
					{#if t.open_count > 0}<span class="badge">{t.open_count}</span>{/if}
				</a>
			{/each}
		</div>
	{/if}
</main>

<style>
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		margin-bottom: 1rem;
		color: var(--text-muted);
		font-size: 0.9rem;
	}
	.dot {
		display: inline-block;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		vertical-align: middle;
		margin-right: 0.3rem;
	}
	.dot.active {
		background: var(--green);
	}
	.dot.damaged {
		background: var(--red);
	}
	.dot.out_of_service {
		background: var(--grey);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.6rem;
	}
	.tile {
		position: relative;
		aspect-ratio: 1;
		border-radius: var(--radius);
		display: flex;
		align-items: center;
		justify-content: center;
		text-decoration: none;
		color: #fff;
		font-weight: 700;
		font-size: 1.5rem;
		border: 2px solid transparent;
	}
	.tile.active {
		background: var(--green);
	}
	.tile.damaged {
		background: var(--red);
	}
	.tile.out_of_service {
		background: var(--grey);
	}
	.badge {
		position: absolute;
		top: 6px;
		right: 6px;
		background: rgba(0, 0, 0, 0.35);
		border-radius: 999px;
		font-size: 0.8rem;
		min-width: 22px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 6px;
	}
</style>
