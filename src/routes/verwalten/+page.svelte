<script lang="ts">
	import { onMount } from 'svelte';
	import { getSupabase } from '$lib/supabase';
	import { TENT_STATUS_LABELS, type TentWithStatus } from '$lib/types';
	import { groupTents } from '$lib/camp-groups';

	let tents = $state<TentWithStatus[]>([]);
	let loading = $state(true);
	let errorMsg = $state<string | null>(null);

	const sections = $derived(groupTents(tents));

	const kpiEinsatzbereit = $derived(tents.filter((t) => t.status === 'active').length);
	const kpiReparatur = $derived(tents.filter((t) => t.status === 'damaged').length);
	const kpiAusserBetrieb = $derived(tents.filter((t) => t.status === 'out_of_service').length);
	const kpiOffeneSchaeden = $derived(tents.reduce((sum, t) => sum + (t.open_count ?? 0), 0));

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
	<div class="head">
		<h1>Flotte</h1>
		<a class="secondary btn" href="/verwalten/lager">Lager einrichten</a>
	</div>
	{#if errorMsg}<div class="banner err">{errorMsg}</div>{/if}
	{#if loading}
		<p class="muted">Laden…</p>
	{:else}
		<div class="kpi-strip">
			<div class="kpi">
				<span class="kpi-val active">{kpiEinsatzbereit}</span>
				<span class="kpi-label">Einsatzbereit</span>
			</div>
			<div class="kpi">
				<span class="kpi-val damaged">{kpiReparatur}</span>
				<span class="kpi-label">Reparatur nötig</span>
			</div>
			<div class="kpi">
				<span class="kpi-val out_of_service">{kpiAusserBetrieb}</span>
				<span class="kpi-label">Ausser Betrieb</span>
			</div>
			<a class="kpi kpi-link" href="/verwalten/reparaturen">
				<span class="kpi-val">{kpiOffeneSchaeden}</span>
				<span class="kpi-label">Offene Schäden</span>
			</a>
		</div>
		<div class="legend">
			<span><i class="dot active"></i> {TENT_STATUS_LABELS.active}</span>
			<span><i class="dot damaged"></i> {TENT_STATUS_LABELS.damaged}</span>
			<span><i class="dot out_of_service"></i> {TENT_STATUS_LABELS.out_of_service}</span>
		</div>
		{#each sections as section (section.name)}
			<section class="group">
				<h2 class:inactive={section.inactive}>{section.name}</h2>
				<div class="grid">
					{#each section.tents as t (t.tent_id)}
						<a class="tile {t.status}" href={`/verwalten/zelt/${t.tent_id}`}>
							<span class="num">{t.tent_id}</span>
							{#if t.open_count > 0}<span class="badge">{t.open_count}</span>{/if}
						</a>
					{/each}
				</div>
			</section>
		{/each}
	{/if}
</main>

<style>
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.btn {
		text-decoration: none;
		min-height: 40px;
		display: inline-flex;
		align-items: center;
		padding: 0 0.9rem;
		border-radius: var(--radius);
		font-weight: 600;
		white-space: nowrap;
	}
	.kpi-strip {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}
	.kpi {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex: 1 1 0;
		min-width: 80px;
		padding: 0.6rem 0.5rem;
		border-radius: var(--radius);
		background: var(--surface, #f5f5f5);
		gap: 0.15rem;
	}
	.kpi-link {
		text-decoration: none;
		color: inherit;
	}
	.kpi-link:hover {
		background: var(--surface-hover, #eaeaea);
	}
	.kpi-val {
		font-size: 1.8rem;
		font-weight: 700;
		line-height: 1;
	}
	.kpi-val.active {
		color: var(--green);
	}
	.kpi-val.damaged {
		color: var(--red);
	}
	.kpi-val.out_of_service {
		color: var(--grey);
	}
	.kpi-label {
		font-size: 0.78rem;
		color: var(--text-muted);
		text-align: center;
		white-space: nowrap;
	}
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
	.group {
		margin-bottom: 1.5rem;
	}
	.group h2 {
		font-size: 1.05rem;
		margin: 0 0 0.6rem;
	}
	.group h2.inactive {
		color: var(--text-muted);
		font-weight: 600;
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
