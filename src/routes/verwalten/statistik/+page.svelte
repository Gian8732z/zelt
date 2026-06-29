<script lang="ts">
	import { onMount } from 'svelte';
	import { getSupabase } from '$lib/supabase';
	import { COMPONENTS, damageMode, snapshotLabel } from '$lib/damage-types';
	import { Chart, registerables } from 'chart.js';

	Chart.register(...registerables);

	type RawRow = {
		component: string | null;
		damage_kind: string | null;
		quantity: number | null;
		status: string;
		camp: string | null;
		tent_id: number | null;
		reported_at: string | null;
		resolution_timestamp: string | null;
	};

	type DamageGroup = {
		key: string;
		component: string;
		damage_kind: string;
		label: string;
		total: number;
		isCount: boolean;
		tentCount: number;
		tents: number[];
	};

	let rows = $state<RawRow[]>([]);
	let loading = $state(true);
	let errorMsg = $state<string | null>(null);
	let selectedCamp = $state('');
	let section4ShowAll = $state(false);

	// Canvas refs — must be $state so $effect tracks them
	let canvasComp = $state<HTMLCanvasElement | undefined>(undefined);
	let canvasTent = $state<HTMLCanvasElement | undefined>(undefined);
	let canvasCamp = $state<HTMLCanvasElement | undefined>(undefined);

	// Chart instances — plain (non-reactive) variables
	let chartComp: Chart | undefined;
	let chartTent: Chart | undefined;
	let chartCamp: Chart | undefined;

	async function load() {
		const sb = getSupabase();
		if (!sb) return;
		loading = true;
		errorMsg = null;
		const { data, error } = await sb
			.from('damages')
			.select(
				'component, damage_kind, quantity, status, camp, tent_id, reported_at, resolution_timestamp'
			);
		loading = false;
		if (error) {
			errorMsg = error.message;
			return;
		}
		rows = (data ?? []) as RawRow[];
	}

	onMount(load);

	// Exclude invalid from all statistics
	const validRows = $derived(rows.filter((r) => r.status !== 'invalid'));

	// Distinct non-null camps for the season filter (sorted)
	const camps = $derived(
		[...new Set(validRows.map((r) => r.camp).filter((c): c is string => c !== null))].sort()
	);

	// Working set for sections 1–4 (respects season filter)
	const filtered = $derived(
		selectedCamp === '' ? validRows : validRows.filter((r) => r.camp === selectedCamp)
	);

	// ── Section 1: Übersicht ─────────────────────────────────────────────────
	const kpiGesamt = $derived(filtered.length);
	const kpiOffen = $derived(filtered.filter((r) => r.status === 'open').length);
	const kpiErledigt = $derived(filtered.filter((r) => r.status === 'resolved').length);
	const kpiAnteil = $derived(kpiGesamt > 0 ? Math.round((kpiErledigt / kpiGesamt) * 100) : 0);
	const kpiReparaturzeit = $derived.by(() => {
		const resolved = filtered.filter(
			(r) => r.status === 'resolved' && r.reported_at && r.resolution_timestamp
		);
		if (resolved.length === 0) return null;
		const totalDays = resolved.reduce((sum, r) => {
			return (
				sum +
				(new Date(r.resolution_timestamp!).getTime() - new Date(r.reported_at!).getTime()) /
					86_400_000
			);
		}, 0);
		return (totalDays / resolved.length).toFixed(1);
	});

	// ── Section 2: Nach Komponente ───────────────────────────────────────────
	const byComponent = $derived.by(() => {
		const map = new Map<string, number>();
		for (const r of filtered) {
			if (!r.component) continue;
			map.set(r.component, (map.get(r.component) ?? 0) + 1);
		}
		return [...map.entries()]
			.map(([comp, count]) => ({
				comp,
				label: COMPONENTS.find((c) => c.component === comp)?.label ?? comp,
				count
			}))
			.sort((a, b) => b.count - a.count);
	});

	// ── Section 3: Nach Zelt ─────────────────────────────────────────────────
	const byTent = $derived.by(() => {
		const map = new Map<number, number>();
		for (const r of filtered) {
			if (r.tent_id === null) continue;
			map.set(r.tent_id, (map.get(r.tent_id) ?? 0) + 1);
		}
		return [...map.entries()]
			.map(([tent_id, count]) => ({ tent_id, count }))
			.sort((a, b) => b.count - a.count);
	});

	// ── Section 4: Nach Schadenstyp ──────────────────────────────────────────
	// Own toggle: default "Nur offene"; "Alle" includes open+resolved (invalid already excluded)
	const section4Rows = $derived(
		section4ShowAll ? filtered : filtered.filter((r) => r.status === 'open')
	);

	const damageGroups = $derived.by((): DamageGroup[] => {
		const map = new Map<string, { total: number; isCount: boolean; tentSet: Set<number> }>();
		for (const r of section4Rows) {
			if (!r.component || !r.damage_kind) continue;
			const key = `${r.component}|${r.damage_kind}`;
			const isCount = damageMode(r.component, r.damage_kind)?.input === 'count';
			if (!map.has(key)) map.set(key, { total: 0, isCount, tentSet: new Set() });
			const g = map.get(key)!;
			g.total += isCount ? (r.quantity ?? 1) : 1;
			if (r.tent_id !== null) g.tentSet.add(r.tent_id);
		}
		return [...map.entries()]
			.map(([key, g]) => {
				const [component, damage_kind] = key.split('|');
				const tents = [...g.tentSet].sort((a, b) => a - b);
				return {
					key,
					component,
					damage_kind,
					label: snapshotLabel(component, damage_kind),
					total: g.total,
					isCount: g.isCount,
					tentCount: tents.length,
					tents
				};
			})
			.sort((a, b) => b.total - a.total);
	});

	// ── Section 5: Pro Saison ────────────────────────────────────────────────
	// Always uses ALL valid rows — ignores the page Saison filter
	const byCamp = $derived.by(() => {
		const map = new Map<string, number>();
		for (const r of validRows) {
			const c = r.camp ?? 'Unbekannt';
			map.set(c, (map.get(c) ?? 0) + 1);
		}
		return [...map.entries()]
			.map(([camp, count]) => ({ camp, count }))
			.sort((a, b) => a.camp.localeCompare(b.camp));
	});

	// ── Chart palette ────────────────────────────────────────────────────────
	const ORANGE = '#d97706';
	const GREEN = '#1f6f43'; // --green
	const RED = '#c0392b'; // --red

	// Chart: Nach Komponente (horizontal bar, sorted desc)
	$effect(() => {
		if (!canvasComp) return;
		const data = byComponent;
		chartComp?.destroy();
		chartComp = new Chart(canvasComp, {
			type: 'bar',
			data: {
				labels: data.map((d) => d.label),
				datasets: [{ label: 'Schäden', data: data.map((d) => d.count), backgroundColor: ORANGE }]
			},
			options: {
				indexAxis: 'y',
				responsive: true,
				maintainAspectRatio: false,
				plugins: { legend: { display: false } },
				scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
			}
		});
		return () => {
			chartComp?.destroy();
			chartComp = undefined;
		};
	});

	// Chart: Nach Zelt (vertical bar, sorted desc)
	$effect(() => {
		if (!canvasTent) return;
		const data = byTent;
		chartTent?.destroy();
		chartTent = new Chart(canvasTent, {
			type: 'bar',
			data: {
				labels: data.map((d) => `Zelt ${d.tent_id}`),
				datasets: [{ label: 'Schäden', data: data.map((d) => d.count), backgroundColor: RED }]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: { legend: { display: false } },
				scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
			}
		});
		return () => {
			chartTent?.destroy();
			chartTent = undefined;
		};
	});

	// Chart: Pro Saison (vertical bar, sorted by camp name)
	$effect(() => {
		if (!canvasCamp) return;
		const data = byCamp;
		chartCamp?.destroy();
		chartCamp = new Chart(canvasCamp, {
			type: 'bar',
			data: {
				labels: data.map((d) => d.camp),
				datasets: [{ label: 'Schäden', data: data.map((d) => d.count), backgroundColor: GREEN }]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: { legend: { display: false } },
				scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
			}
		});
		return () => {
			chartCamp?.destroy();
			chartCamp = undefined;
		};
	});
</script>

<main>
	<h1>Statistik</h1>

	{#if errorMsg}
		<div class="banner err">{errorMsg}</div>
	{/if}

	{#if loading}
		<p class="muted">Laden…</p>
	{:else}
		{#if camps.length > 1}
			<div class="filter-row">
				<span class="filter-label">Saison</span>
				<select class="filter-select" bind:value={selectedCamp}>
					<option value="">Alle Saisons</option>
					{#each camps as camp (camp)}
						<option value={camp}>{camp}</option>
					{/each}
				</select>
			</div>
		{/if}

		<!-- Section 1: Übersicht -->
		<div class="card">
			<h2>Übersicht</h2>
			<div class="kpi-strip">
				<div class="kpi">
					<span class="kpi-val">{kpiGesamt}</span>
					<span class="kpi-label">Schäden gesamt</span>
				</div>
				<div class="kpi">
					<span class="kpi-val" style="color:var(--red)">{kpiOffen}</span>
					<span class="kpi-label">Offen</span>
				</div>
				<div class="kpi">
					<span class="kpi-val" style="color:var(--green)">{kpiErledigt}</span>
					<span class="kpi-label">Erledigt</span>
				</div>
				<div class="kpi">
					<span class="kpi-val">{kpiGesamt > 0 ? `${kpiAnteil} %` : '–'}</span>
					<span class="kpi-label">Anteil erledigt</span>
				</div>
				<div class="kpi">
					<span class="kpi-val kpi-val--sm">
						{kpiReparaturzeit !== null ? `${kpiReparaturzeit} Tage` : '–'}
					</span>
					<span class="kpi-label">ø Reparaturzeit</span>
				</div>
			</div>
		</div>

		<!-- Section 2: Nach Komponente -->
		<div class="card">
			<h2>Nach Komponente</h2>
			{#if byComponent.length > 0}
				<div class="chart-wrap">
					<canvas bind:this={canvasComp}></canvas>
				</div>
			{:else}
				<p class="muted">Keine Daten</p>
			{/if}
		</div>

		<!-- Section 3: Nach Zelt -->
		<div class="card">
			<h2>Nach Zelt</h2>
			{#if byTent.length > 0}
				<div class="chart-wrap">
					<canvas bind:this={canvasTent}></canvas>
				</div>
				<ol class="tent-rank">
					{#each byTent as item (item.tent_id)}
						<li>
							<a href="/verwalten/zelt/{item.tent_id}">Zelt {item.tent_id}</a>
							— {item.count}
							{item.count === 1 ? 'Schaden' : 'Schäden'}
						</li>
					{/each}
				</ol>
			{:else}
				<p class="muted">Keine Daten</p>
			{/if}
		</div>

		<!-- Section 4: Nach Schadenstyp -->
		<div class="card">
			<div class="section-head">
				<h2>Nach Schadenstyp</h2>
				<div class="filter-tabs">
					<button
						class={!section4ShowAll ? '' : 'secondary'}
						onclick={() => (section4ShowAll = false)}
					>
						Nur offene
					</button>
					<button
						class={section4ShowAll ? '' : 'secondary'}
						onclick={() => (section4ShowAll = true)}
					>
						Alle
					</button>
				</div>
			</div>
			{#if damageGroups.length > 0}
				<ul class="damage-list">
					{#each damageGroups as g (g.key)}
						<li class="damage-row">
							<span class="damage-label">{g.label}:</span>
							<span class="damage-total">
								{g.total}{g.isCount ? ' Stück' : g.total === 1 ? ' Meldung' : ' Meldungen'}
							</span>
							<span class="muted">
								·&nbsp;{g.tentCount}&nbsp;{g.tentCount === 1 ? 'Zelt' : 'Zelte'}
								({g.tents.join(', ')})
							</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="muted">Keine Daten</p>
			{/if}
		</div>

		<!-- Section 5: Pro Saison (all camps, ignores page filter) -->
		<div class="card">
			<h2>Pro Saison</h2>
			<p class="muted section-note">Alle Saisons – unabhängig vom Filter oben.</p>
			{#if byCamp.length > 0}
				<div class="chart-wrap">
					<canvas bind:this={canvasCamp}></canvas>
				</div>
			{:else}
				<p class="muted">Keine Daten</p>
			{/if}
		</div>
	{/if}
</main>

<style>
	h2 {
		margin: 0 0 0.75rem;
	}
	.filter-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}
	.filter-label {
		font-weight: 600;
		white-space: nowrap;
	}
	.filter-select {
		width: auto;
		min-width: 160px;
		min-height: 40px;
		padding: 0.4rem 0.75rem;
	}
	.kpi-strip {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}
	.kpi {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex: 1 1 80px;
		min-width: 80px;
		padding: 0.6rem 0.4rem;
		border-radius: var(--radius);
		background: var(--bg);
		gap: 0.15rem;
		text-align: center;
	}
	.kpi-val {
		font-size: 1.5rem;
		font-weight: 700;
		line-height: 1;
		white-space: nowrap;
	}
	.kpi-val--sm {
		font-size: 1.15rem;
	}
	.kpi-label {
		font-size: 0.72rem;
		color: var(--text-muted);
		text-align: center;
		line-height: 1.3;
	}
	.chart-wrap {
		position: relative;
		height: 260px;
	}
	.section-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.75rem;
	}
	.section-head h2 {
		margin: 0;
	}
	.filter-tabs {
		display: flex;
		gap: 0.4rem;
		flex-shrink: 0;
	}
	.filter-tabs button {
		min-height: 36px;
		padding: 0 0.8rem;
		font-size: 0.85rem;
	}
	.damage-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.damage-row {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.3rem;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--border);
		font-size: 0.9rem;
	}
	.damage-row:last-child {
		border-bottom: none;
		padding-bottom: 0;
	}
	.damage-label {
		font-weight: 600;
	}
	.damage-total {
		font-weight: 700;
	}
	.tent-rank {
		margin: 0.75rem 0 0;
		padding-left: 1.4rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.9rem;
	}
	.section-note {
		font-size: 0.85rem;
		margin: -0.25rem 0 0.75rem;
	}
</style>
