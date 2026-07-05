<script lang="ts">
	// Interactive 3D model of the 8er Spatz. three.js (via scene.ts) is dynamically imported on
	// mount so the library never lands in the eager bundle. Tapping a sub-part fires `onselect`
	// with its SubPartKey; drags rotate (OrbitControls) and are told apart from taps by pointer
	// travel. Devices without WebGL get a German notice instead of a canvas.
	import { onMount } from 'svelte';
	import type { OpenDamage } from '$lib/tent-info';
	import { computeSubPartStates, type SubPartKey } from '$lib/tent3d/parts';
	import type { TentScene } from '$lib/tent3d/scene';

	let {
		open = [],
		selected = null,
		xray = false,
		onselect
	}: {
		open?: OpenDamage[];
		selected?: SubPartKey | null;
		xray?: boolean;
		onselect?: (part: SubPartKey) => void;
	} = $props();

	let canvas = $state<HTMLCanvasElement>();
	let scene = $state<TentScene | null>(null);
	let failed = $state(false);
	let gone = false;
	let ro: ResizeObserver | undefined;

	// Separate from onMount so the failure notice can offer a retry — on camp wifi the lazy
	// three.js chunk can simply time out, which is not "device unsupported".
	async function init() {
		failed = false;
		try {
			const { createTentScene } = await import('$lib/tent3d/scene');
			if (gone || !canvas || scene) return;
			scene = createTentScene(canvas);
			ro = new ResizeObserver(() => scene?.resize());
			ro.observe(canvas);
		} catch (err) {
			console.error('Tent3D konnte nicht initialisiert werden:', err);
			failed = true;
		}
	}

	onMount(() => {
		init();
		return () => {
			gone = true;
			ro?.disconnect();
			scene?.dispose();
			scene = null;
		};
	});

	$effect(() => {
		scene?.setStates(computeSubPartStates(open));
	});
	$effect(() => {
		scene?.setSelected(selected ?? null);
	});
	$effect(() => {
		scene?.setXray(xray);
	});

	// Tap vs. drag: only a single pointer that barely moved counts as a pick. A second finger
	// (pinch-zoom) cancels the tap outright — otherwise a near-still pinch finger would fire
	// onselect mid-gesture — and pointercancel clears any half-tracked gesture.
	let down: { id: number; x: number; y: number } | null = null;
	function pointerdown(e: PointerEvent) {
		down = down ? null : { id: e.pointerId, x: e.clientX, y: e.clientY };
	}
	function pointerup(e: PointerEvent) {
		const d = down;
		down = null;
		if (!d || d.id !== e.pointerId || !scene) return;
		if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) return;
		const hit = scene.pick(e.clientX, e.clientY);
		if (hit) onselect?.(hit);
	}
	function pointercancel() {
		down = null;
	}
</script>

<div class="stage">
	<canvas
		bind:this={canvas}
		aria-label="3D-Modell des Zelts – Teil antippen, um es auszuwählen"
		onpointerdown={pointerdown}
		onpointerup={pointerup}
		onpointercancel={pointercancel}
	></canvas>
	{#if failed}
		<div class="overlay">
			<p>3D-Ansicht konnte nicht geladen werden.</p>
			<button type="button" class="retry" onclick={init}>Erneut versuchen</button>
		</div>
	{:else if !scene}
		<p class="overlay">3D-Modell wird geladen …</p>
	{:else}
		<button type="button" class="reset" title="Ansicht zurücksetzen" onclick={() => scene?.resetView()}>
			↺
		</button>
	{/if}
</div>

<style>
	.stage {
		position: relative;
		border-radius: var(--radius);
		overflow: hidden;
		background: linear-gradient(#dfe9f0, #f2ede2 70%);
	}
	canvas {
		display: block;
		width: 100%;
		aspect-ratio: 4 / 3;
		touch-action: none;
	}
	.overlay {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		align-content: center;
		gap: 0.6rem;
		margin: 0;
		padding: 1rem;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.9rem;
	}
	.overlay p {
		margin: 0;
	}
	.retry {
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--surface);
		color: var(--text);
		padding: 0.45rem 0.9rem;
		font-size: 0.9rem;
		cursor: pointer;
	}
	.reset {
		position: absolute;
		right: 0.6rem;
		bottom: 0.6rem;
		width: 2.4rem;
		height: 2.4rem;
		border: 1px solid var(--border);
		border-radius: 50%;
		background: var(--surface);
		color: var(--text);
		font-size: 1.1rem;
		cursor: pointer;
	}
</style>
