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

	onMount(() => {
		let gone = false;
		let ro: ResizeObserver | undefined;
		(async () => {
			try {
				const { createTentScene } = await import('$lib/tent3d/scene');
				if (gone || !canvas) return;
				scene = createTentScene(canvas);
				ro = new ResizeObserver(() => scene?.resize());
				ro.observe(canvas);
			} catch {
				failed = true;
			}
		})();
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

	// Tap vs. drag: only a pointer that barely moved counts as a pick.
	let down: { x: number; y: number } | null = null;
	function pointerdown(e: PointerEvent) {
		down = { x: e.clientX, y: e.clientY };
	}
	function pointerup(e: PointerEvent) {
		if (!down || !scene) {
			down = null;
			return;
		}
		const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
		down = null;
		if (moved > 8) return;
		const hit = scene.pick(e.clientX, e.clientY);
		if (hit) onselect?.(hit);
	}
</script>

<div class="stage">
	{#if failed}
		<p class="fallback">3D-Ansicht wird auf diesem Gerät nicht unterstützt.</p>
	{:else}
		<canvas
			bind:this={canvas}
			aria-label="3D-Modell des Zelts – Teil antippen, um es auszuwählen"
			onpointerdown={pointerdown}
			onpointerup={pointerup}
		></canvas>
		{#if !scene}
			<p class="loading">3D-Modell wird geladen …</p>
		{:else}
			<button type="button" class="reset" title="Ansicht zurücksetzen" onclick={() => scene?.resetView()}>
				↺
			</button>
		{/if}
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
	.loading,
	.fallback {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		margin: 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}
	.fallback {
		position: static;
		padding: 3rem 1rem;
		text-align: center;
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
