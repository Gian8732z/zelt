<script lang="ts">
	import type { OpenDamage } from '$lib/tent-info';
	import {
		computePartStates,
		PART_LABELS,
		type PartKey,
		type Severity
	} from '$lib/tent-parts';
	import tentDiagram from '$lib/assets/tent.jpg';

	let {
		open = [],
		selected = null,
		onselect
	}: {
		open?: OpenDamage[];
		selected?: PartKey | null;
		onselect?: (part: PartKey) => void;
	} = $props();

	const states = $derived(computePartStates(open));

	function sevClass(p: PartKey): Severity | '' {
		return states[p] ?? '';
	}
	function active(p: PartKey): boolean {
		return !!states[p];
	}
	function activate(p: PartKey) {
		if (active(p)) onselect?.(p);
	}
	function partLabel(p: PartKey): string {
		const sev = states[p];
		return sev ? `${PART_LABELS[p]} – ${sev === 'missing' ? 'fehlt' : 'beschädigt'}` : PART_LABELS[p];
	}
	// Interactive attributes only for parts that actually carry damage.
	function attrs(p: PartKey) {
		if (!active(p)) return {};
		return {
			role: 'button',
			tabindex: 0,
			'aria-label': partLabel(p),
			onclick: () => activate(p),
			onkeydown: (e: KeyboardEvent) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					activate(p);
				}
			}
		};
	}

	// ── Overlay vectors ──────────────────────────────────────────────────────
	// The three region shapes come straight from Figma (group6 export: Aussenzelt /
	// Vorzelt / Innenzelt), each cropped to its own bounding box. The `d` strings are
	// verbatim; the only thing we add is the translate that drops each box back into
	// place over the background (the art is 2048-wide; see docs/tent-diagram.md).
	const REGION: Record<PartKey, { d: string; t: string }> = {
		vorzelt: {
			d: 'M483.478 0.545288L0.977905 872.045L371.978 788.045V735.545L549.978 529.045L728.478 242.045L1407.48 900.045L1484.48 816.045H1571.98L791.478 46.0453L483.478 0.545288Z',
			t: 'translate(23, 529)'
		},
		aussenzelt: {
			d: 'M722.365 245.658L589.365 67.1575L1.36462 0.657532L774.865 774.158L848.365 707.658H949.865L974.365 669.158L1051.36 651.658L1135.36 669.158L949.865 476.658L722.365 245.658Z',
			t: 'translate(505, 529)'
		},
		innenzelt: {
			d: 'M0.5 483.789V630.789L763 690.289H861L1015 630.789L861 483.789L360.5 0.788818L175 298.289L0.5 483.789Z',
			t: 'translate(400, 740)'
		}
	};
	const ORDER: PartKey[] = ['aussenzelt', 'vorzelt', 'innenzelt'];
</script>

<figure class="tentmodel">
	<svg viewBox="0 460 2048 1180" role="img" aria-label="Zustand des Zelts">
		<!-- background: the tent illustration -->
		<image href={tentDiagram} x="0" y="0" width="2048" height="2048" preserveAspectRatio="xMidYMid meet" />

		<!-- damage overlays: only the three fabric regions, only when damaged -->
		{#each ORDER as p (p)}
			{#if active(p)}
				<path
					class="wash {sevClass(p)}"
					class:sel={selected === p}
					d={REGION[p].d}
					transform={REGION[p].t}
					{...attrs(p)}
				/>
			{/if}
		{/each}
	</svg>

	{#if Object.keys(states).length > 0}
		<figcaption class="legend">
			<span><i class="sw miss"></i>fehlt</span>
			<span><i class="sw dmg"></i>beschädigt</span>
		</figcaption>
	{/if}
</figure>

<style>
	.tentmodel {
		margin: 0.25rem 0 0;
	}
	svg {
		width: 100%;
		height: auto;
		display: block;
		border-radius: var(--radius);
	}

	/* Translucent wash + coloured outline so the illustration shows through */
	.wash {
		fill-opacity: 0.4;
		stroke-width: 10;
		stroke-linejoin: round;
		transition:
			fill-opacity 0.15s,
			stroke-width 0.15s;
	}
	.wash.missing {
		fill: var(--red);
		stroke: var(--red);
	}
	.wash.damaged {
		fill: var(--amber);
		stroke: var(--amber);
	}
	.wash[role='button'] {
		cursor: pointer;
	}
	.wash[role='button']:focus-visible {
		outline: none;
	}

	/* Selected (clicked from the list) or focused: stronger */
	.wash.sel,
	.wash[role='button']:focus-visible {
		fill-opacity: 0.52;
		stroke-width: 15;
	}

	.legend {
		display: flex;
		gap: 1rem;
		justify-content: center;
		margin-top: 0.4rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}
	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.sw {
		width: 12px;
		height: 12px;
		border-radius: 3px;
		display: inline-block;
	}
	.sw.miss {
		background: var(--red);
	}
	.sw.dmg {
		background: var(--amber);
	}
</style>
