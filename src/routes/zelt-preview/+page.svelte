<script lang="ts">
	// TEMPORARY preview harness for TentModel — renders the diagram with mock damage,
	// no Supabase needed. Delete this route when done eyeballing.
	import TentModel from '$lib/components/TentModel.svelte';
	import { COMPONENTS, damageMode, snapshotLabel } from '$lib/damage-types';
	import type { OpenDamage } from '$lib/tent-info';
	import { partForComponent, type PartKey } from '$lib/tent-parts';

	function dmg(component: string, kind: string, quantity: number | null = null): OpenDamage {
		return {
			component,
			damage_kind: kind,
			label: snapshotLabel(component, kind),
			quantity,
			description: null,
			reported_at: ''
		};
	}

	const scenarios: { title: string; open: OpenDamage[] }[] = [
		{ title: 'Kein Schaden', open: [] },
		{ title: 'Vorzelt gerissen', open: [dmg('vorzelt', 'stoff_gerissen')] },
		{ title: 'Aussenzelt fehlt + Heringe fehlen', open: [dmg('aussenzelt', 'fehlt'), dmg('heringe', 'fehlt', 3)] },
		{ title: 'Innenzelt + Stange + Abspannung', open: [dmg('innenzelt', 'stoff_gerissen'), dmg('stangen', 'verbogen'), dmg('vorzelt', 'abspannung_gerissen')] },
		{ title: 'Aufhängung gerissen', open: [dmg('innenzelt', 'aufhaengung_gerissen')] },
		{ title: 'Alles fehlt', open: [dmg('vorzelt', 'fehlt'), dmg('aussenzelt', 'fehlt'), dmg('innenzelt', 'fehlt'), dmg('stangen', 'fehlt'), dmg('heringe', 'fehlt', 5)] }
	];

	// Interactive card. Cells are `${component}:${kind}` so each fabric region can be toggled.
	const cells = COMPONENTS.flatMap((c) =>
		partForComponent(c.component) ? c.modes.map((m) => ({ component: c.component, kind: m.kind, label: snapshotLabel(c.component, m.kind) })) : []
	);
	let chosen = $state<Set<string>>(new Set(['vorzelt:stoff_gerissen', 'aussenzelt:fehlt']));
	let selectedPart = $state<PartKey | null>(null);
	const liveOpen = $derived(
		[...chosen].map((id) => {
			const [c, k] = id.split(':');
			return dmg(c, k, damageMode(c, k)?.input === 'count' ? 2 : null);
		})
	);
	function toggle(id: string) {
		const n = new Set(chosen);
		n.has(id) ? n.delete(id) : n.add(id);
		chosen = n;
	}
	function selectPart(p: PartKey) {
		selectedPart = selectedPart === p ? null : p;
	}
</script>

<main>
	<h1>TentModel — Vorschau</h1>
	<p class="muted">Temporäre Seite, kein Backend. Klick auf einen markierten Teil hebt ihn hervor.</p>

	<section class="grid">
		{#each scenarios as s}
			<div class="card">
				<strong>{s.title}</strong>
				<TentModel open={s.open} />
			</div>
		{/each}
	</section>

	<h2>Interaktiv</h2>
	<section class="live">
		<div class="card">
			<TentModel open={liveOpen} selected={selectedPart} onselect={selectPart} />
		</div>
		<div class="toggles">
			{#each cells as c (c.component + ':' + c.kind)}
				{@const id = c.component + ':' + c.kind}
				<label class:on={chosen.has(id)}>
					<input type="checkbox" checked={chosen.has(id)} onchange={() => toggle(id)} />
					{c.label} <span class="muted">→ {c.component}</span>
				</label>
			{/each}
		</div>
	</section>
</main>

<style>
	main {
		max-width: 1100px;
		margin: 0 auto;
		padding: 1.5rem;
	}
	.muted {
		color: #6b7280;
		font-size: 0.9rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1rem;
		margin: 1rem 0 2rem;
	}
	.card {
		border: 1px solid #e3e3e0;
		border-radius: 12px;
		padding: 0.75rem;
		background: #fff;
	}
	.card strong {
		display: block;
		font-size: 0.85rem;
		margin-bottom: 0.25rem;
	}
	.live {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.5rem;
		align-items: start;
	}
	.toggles {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.toggles label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.6rem;
		border: 1px solid #e3e3e0;
		border-radius: 8px;
		font-size: 0.9rem;
		cursor: pointer;
	}
	.toggles label.on {
		border-color: #c0392b;
		background: #fdecea;
	}
</style>
