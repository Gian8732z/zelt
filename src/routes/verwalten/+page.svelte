<script lang="ts">
	import { onMount } from 'svelte';
	import { getSupabase } from '$lib/supabase';
	import { TENT_STATUS_LABELS, type TentWithStatus } from '$lib/types';
	import { groupTents } from '$lib/camp-groups';
	import { nextTentId, validateNewTentId } from '$lib/tents';

	let tents = $state<TentWithStatus[]>([]);
	let loading = $state(true);
	let errorMsg = $state<string | null>(null);

	// Add-tent inline form. existingIds covers active AND retired tents (read straight from `tents`,
	// not the retired-filtered overview), so the default + collision check never reuse a reserved id.
	let addOpen = $state(false);
	let addId = $state<number | null>(null);
	let addBusy = $state(false);
	let addError = $state<string | null>(null);
	let existingIds = $state<number[]>([]);

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

	async function openAdd() {
		const sb = getSupabase();
		if (!sb) return;
		addError = null;
		// All ids incl. retired — retired ones keep their number reserved (their history references it).
		const { data } = await sb.from('tents').select('tent_id');
		existingIds = (data ?? []).map((t) => t.tent_id as number);
		addId = nextTentId(existingIds);
		addOpen = true;
	}

	async function createTent() {
		const sb = getSupabase();
		if (!sb || addId === null) return;
		const err = validateNewTentId(addId, existingIds);
		if (err) {
			addError = err;
			return;
		}
		addBusy = true;
		addError = null;
		// New tent: in service, no camp_group → renders under "Nicht im Lager" until assigned in Lager.
		const { error } = await sb.from('tents').insert({ tent_id: addId });
		addBusy = false;
		if (error) {
			addError = error.code === '23505' ? `Zelt ${addId} existiert bereits.` : error.message;
			return;
		}
		addOpen = false;
		await load();
	}
</script>

<main>
	<div class="head">
		<h1>Übersicht</h1>
		<div class="head-actions">
			<button class="secondary btn" onclick={openAdd}>+ Zelt</button>
			<a class="secondary btn" href="/verwalten/lager">Lager einrichten</a>
		</div>
	</div>

	{#if addOpen}
		<div class="card add-form">
			<p class="add-label"><strong>Neues Zelt hinzufügen</strong></p>
			<label class="add-field">
				Zelt-Nr.
				<input
					type="number"
					min="1"
					inputmode="numeric"
					bind:value={addId}
					oninput={() => (addError = null)}
				/>
			</label>
			<p class="muted add-hint">
				Landet ohne Gruppe unter «Nicht im Lager» – Gruppe später unter «Lager einrichten».
			</p>
			{#if addError}<div class="banner err">{addError}</div>{/if}
			<div class="actions">
				<button disabled={addBusy} onclick={createTent}>
					{addBusy ? 'Wird gespeichert…' : 'Hinzufügen'}
				</button>
				<button class="secondary" disabled={addBusy} onclick={() => (addOpen = false)}>
					Abbrechen
				</button>
			</div>
		</div>
	{/if}

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
		margin-bottom: 1.25rem;
	}
	.head-actions {
		display: flex;
		gap: 0.5rem;
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
		cursor: pointer;
	}
	.add-form {
		margin-bottom: 1.25rem;
	}
	.add-label {
		margin: 0 0 0.5rem;
	}
	.add-field {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-weight: 600;
	}
	.add-field input {
		width: 6rem;
		min-height: 44px;
	}
	.add-hint {
		margin: 0.5rem 0 0;
		font-size: 0.85rem;
	}
	.add-form .actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
	.add-form .actions button {
		min-height: 44px;
		padding: 0 1.2rem;
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
