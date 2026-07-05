<script lang="ts">
	// PREVIEW HARNESS for the 3D tent model — mock data, no backend (the 3D pendant to
	// /zelt-preview). Proves two things ahead of any post-camp wiring into the reporter form:
	// 1. DISPLAY: the toggles below simulate open damages; the model tints the exact sub-part
	//    (amber = beschädigt, red ghost = fehlt) and auto-enables the x-ray view for interior damage.
	// 2. REPORT: tapping a sub-part opens that component's mode menu with the mapped mode
	//    highlighted ("vorgeschlagen"); chosen modes land in a "Würde melden" list — no submit.
	import Tent3D from '$lib/components/Tent3D.svelte';
	import { COMPONENTS, componentDef, damageMode, snapshotLabel } from '$lib/damage-types';
	import type { OpenDamage } from '$lib/tent-info';
	import {
		SUBPART_LABELS,
		SUBPART_TARGETS,
		hasInteriorDamage,
		type SubPartKey
	} from '$lib/tent3d/parts';

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

	// ── Display: simulated open damages ──────────────────────────────────────
	const cells = COMPONENTS.filter((c) => c.component !== 'sonstiges').flatMap((c) =>
		c.modes.map((m) => ({ component: c.component, kind: m.kind, label: snapshotLabel(c.component, m.kind) }))
	);
	let chosen = $state<Set<string>>(new Set(['vorzelt:abspannung_gerissen', 'heringe:fehlt']));
	const liveOpen = $derived(
		[...chosen].map((id) => {
			const [c, k] = id.split(':');
			return dmg(c, k, damageMode(c, k)?.input === 'count' ? 2 : null);
		})
	);
	function toggle(id: string) {
		const n = new Set(chosen);
		if (n.has(id)) n.delete(id);
		else n.add(id);
		chosen = n;
	}

	// X-ray: auto-on when interior damage APPEARS (edge-triggered, not re-forced on every change,
	// so a manual off stays off until the next new interior damage); manual toggle on top.
	let xray = $state(false);
	let hadInterior = false;
	$effect(() => {
		const now = hasInteriorDamage(liveOpen);
		if (now && !hadInterior) xray = true;
		hadInterior = now;
	});

	// ── Report prototype: tap → component menu with suggested mode ───────────
	let menuFor = $state<SubPartKey | null>(null);
	const menuComponent = $derived(menuFor ? componentDef(SUBPART_TARGETS[menuFor].component) : undefined);
	const suggestedKind = $derived(menuFor ? SUBPART_TARGETS[menuFor].kind : null);
	let wouldReport = $state<{ component: string; kind: string; label: string }[]>([]);
	function pickMode(component: string, kind: string) {
		if (!wouldReport.some((w) => w.component === component && w.kind === kind)) {
			wouldReport = [...wouldReport, { component, kind, label: snapshotLabel(component, kind) }];
		}
		menuFor = null;
	}
	function removeWould(i: number) {
		wouldReport = wouldReport.toSpliced(i, 1);
	}
</script>

<main>
	<h1>8er Spatz — 3D-Vorschau</h1>
	<p class="muted">
		Temporäre Seite, kein Backend. Ziehen dreht das Zelt, Antippen wählt einen Teil aus und öffnet
		das Schadens-Menü mit dem passenden Vorschlag.
	</p>

	<section class="layout">
		<div class="card model">
			<Tent3D open={liveOpen} selected={menuFor} {xray} onselect={(p) => (menuFor = p)} />
			<label class="xray">
				<input type="checkbox" bind:checked={xray} />
				Innenansicht (Aussenzelt durchsichtig)
			</label>
		</div>

		<div class="side">
			{#if menuFor && menuComponent}
				<div class="card menu">
					<header>
						<strong>{SUBPART_LABELS[menuFor]}</strong>
						<button type="button" class="close" onclick={() => (menuFor = null)}>Schliessen</button>
					</header>
					<p class="muted small">Komponente: {menuComponent.label} — Schaden wählen:</p>
					<div class="modes">
						{#each menuComponent.modes as m (m.kind)}
							<button
								type="button"
								class="mode"
								class:suggested={m.kind === suggestedKind}
								onclick={() => pickMode(menuComponent.component, m.kind)}
							>
								{m.label}
								{#if m.kind === suggestedKind}<span class="badge">vorgeschlagen</span>{/if}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<div class="card">
				<strong class="small">Würde melden</strong>
				{#if wouldReport.length === 0}
					<p class="muted small">Noch nichts ausgewählt — Teil am Zelt antippen.</p>
				{:else}
					<ul class="would">
						{#each wouldReport as w, i (w.component + ':' + w.kind)}
							<li>
								{w.label}
								<button type="button" class="close" onclick={() => removeWould(i)}>Entfernen</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div class="card">
				<strong class="small">Simulierte offene Schäden</strong>
				<div class="toggles">
					{#each cells as c (c.component + ':' + c.kind)}
						{@const id = c.component + ':' + c.kind}
						<label class:on={chosen.has(id)}>
							<input type="checkbox" checked={chosen.has(id)} onchange={() => toggle(id)} />
							{c.label}
						</label>
					{/each}
				</div>
			</div>
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
		color: var(--text-muted);
		font-size: 0.9rem;
	}
	.small {
		font-size: 0.85rem;
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 3fr) minmax(260px, 2fr);
		gap: 1rem;
		align-items: start;
	}
	@media (max-width: 760px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}
	.card {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.75rem;
		background: var(--surface);
	}
	.model {
		position: sticky;
		top: 0.75rem;
	}
	.xray {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.6rem;
		font-size: 0.9rem;
	}
	.side {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.menu header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
	}
	/* The global button style is white-on-green; these quiet buttons need their color re-set. */
	.close {
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		border-radius: 8px;
		padding: 0.25rem 0.6rem;
		min-height: 0;
		font-size: 0.8rem;
		font-weight: 400;
		cursor: pointer;
	}
	.modes {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.mode {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		padding: 0.55rem 0.7rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--surface);
		color: var(--text);
		font-size: 0.9rem;
		font-weight: 400;
		text-align: left;
		cursor: pointer;
	}
	.mode.suggested {
		border-color: var(--green);
		box-shadow: 0 0 0 1px var(--green);
		background: #eef6f0;
	}
	.badge {
		color: var(--green);
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
	}
	.would {
		list-style: none;
		margin: 0.4rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.would li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
	}
	.toggles {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin-top: 0.5rem;
	}
	.toggles label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.35rem 0.55rem;
		border: 1px solid var(--border);
		border-radius: 8px;
		font-size: 0.88rem;
		cursor: pointer;
	}
	.toggles label.on {
		border-color: var(--red);
		background: #fdecea;
	}
</style>
