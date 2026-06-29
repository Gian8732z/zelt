<script lang="ts">
	import { onMount } from 'svelte';
	import { getSupabase } from '$lib/supabase';
	import { snapshotLabel, damageMode } from '$lib/damage-types';

	type RawRow = {
		component: string | null;
		damage_kind: string | null;
		quantity: number | null;
		status: string;
		tent_id: number | null;
	};

	type Group = {
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
	let showAll = $state(false);

	async function load() {
		const sb = getSupabase();
		if (!sb) return;
		loading = true;
		errorMsg = null;
		const { data, error } = await sb
			.from('damages')
			.select('component, damage_kind, quantity, status, tent_id');
		loading = false;
		if (error) {
			errorMsg = error.message;
			return;
		}
		rows = (data ?? []) as RawRow[];
	}

	onMount(load);

	const groups = $derived.by((): Group[] => {
		const filtered = showAll ? rows : rows.filter((r) => r.status === 'open');

		const map = new Map<string, { total: number; isCount: boolean; tentSet: Set<number> }>();

		for (const r of filtered) {
			if (!r.component || !r.damage_kind) continue;
			const key = `${r.component}|${r.damage_kind}`;
			const isCount = damageMode(r.component, r.damage_kind)?.input === 'count';
			if (!map.has(key)) {
				map.set(key, { total: 0, isCount, tentSet: new Set() });
			}
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
</script>

<main>
	<div class="head">
		<h1>Materialübersicht</h1>
		<div class="filter-tabs">
			<button class={!showAll ? '' : 'secondary'} onclick={() => (showAll = false)}>
				Nur offene
			</button>
			<button class={showAll ? '' : 'secondary'} onclick={() => (showAll = true)}>Alle</button>
		</div>
	</div>

	{#if errorMsg}<div class="banner err">{errorMsg}</div>{/if}

	{#if loading}
		<p class="muted">Laden…</p>
	{:else if groups.length === 0}
		<p class="muted">Keine Schäden erfasst.</p>
	{:else}
		{#each groups as g (g.key)}
			<div class="card group-card">
				<div class="group-label">{g.label}</div>
				<div class="group-stats">
					<span class="total"
						>{g.total}{g.isCount ? ' Stück' : g.total === 1 ? ' Meldung' : ' Meldungen'}</span
					>
					<span class="sep muted">·</span>
					<span class="muted"
						>{g.tentCount}
						{g.tentCount === 1 ? 'Zelt' : 'Zelte'}
						<span class="tent-list">({g.tents.join(', ')})</span>
					</span>
				</div>
			</div>
		{/each}
	{/if}
</main>

<style>
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.5rem;
	}
	.filter-tabs {
		display: flex;
		gap: 0.4rem;
	}
	.filter-tabs button {
		min-height: 40px;
		padding: 0 0.9rem;
		font-size: 0.9rem;
	}
	.group-card {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.group-label {
		font-weight: 600;
		font-size: 1rem;
	}
	.group-stats {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.4rem;
		font-size: 0.9rem;
	}
	.total {
		font-weight: 700;
		font-size: 1.05rem;
		color: var(--text);
	}
	.sep {
		line-height: 1;
	}
	.tent-list {
		color: var(--text-muted);
	}
</style>
