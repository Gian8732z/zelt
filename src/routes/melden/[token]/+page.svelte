<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { isConfigured } from '$lib/config';
	import { fetchActiveCategories, cachedCategories } from '$lib/categories';
	import { processPhoto } from '$lib/photo';
	import { submitReport } from '$lib/submit';
	import type { Category, OutboxReport } from '$lib/types';

	const token = $derived($page.params.token ?? '');
	const TENTS = Array.from({ length: 20 }, (_, i) => i + 1);

	let categories = $state<Category[]>([]);
	let selectedTent = $state<number | null>(null);
	let selectedCats = $state<Set<string>>(new Set());
	let notes = $state('');
	let photoFile = $state<File | null>(null);
	let photoPreview = $state<string | null>(null);
	let photoBusy = $state(false);

	let online = $state(true);
	let busy = $state(false);
	let result = $state<null | 'sent' | 'queued'>(null);
	let errorMsg = $state<string | null>(null);

	onMount(() => {
		online = navigator.onLine;
		categories = cachedCategories();
		const on = () => (online = true);
		const off = () => (online = false);
		window.addEventListener('online', on);
		window.addEventListener('offline', off);
		fetchActiveCategories()
			.then((c) => (categories = c))
			.catch(() => {});
		return () => {
			window.removeEventListener('online', on);
			window.removeEventListener('offline', off);
		};
	});

	function toggleCat(id: string) {
		const next = new Set(selectedCats);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedCats = next;
	}

	async function onPhoto(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		if (!file) return;
		photoBusy = true;
		errorMsg = null;
		try {
			const blob = await processPhoto(file);
			photoFile = new File([blob], 'schaden.jpg', { type: 'image/jpeg' });
			if (photoPreview) URL.revokeObjectURL(photoPreview);
			photoPreview = URL.createObjectURL(blob);
		} catch {
			errorMsg = 'Foto konnte nicht verarbeitet werden.';
		} finally {
			photoBusy = false;
		}
	}

	function removePhoto() {
		if (photoPreview) URL.revokeObjectURL(photoPreview);
		photoPreview = null;
		photoFile = null;
	}

	const canSubmit = $derived(selectedTent !== null && selectedCats.size > 0 && !busy && !photoBusy);

	async function submit() {
		if (selectedTent === null || selectedCats.size === 0) return;
		busy = true;
		errorMsg = null;
		const ids = [...selectedCats];
		const labels = ids.map((id) => categories.find((c) => c.id === id)?.label ?? '');
		const report: OutboxReport = {
			report_id: crypto.randomUUID(),
			token,
			tent_id: selectedTent,
			category_ids: ids,
			category_labels: labels,
			notes: notes.trim(),
			reported_at: new Date().toISOString(),
			photo: photoFile,
			queued_at: Date.now()
		};
		try {
			result = await submitReport(report);
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Senden fehlgeschlagen.';
		} finally {
			busy = false;
		}
	}

	function reportAnother() {
		selectedTent = null;
		selectedCats = new Set();
		notes = '';
		removePhoto();
		result = null;
		errorMsg = null;
	}
</script>

<main>
	<h1>Schaden melden</h1>

	{#if !isConfigured}
		<div class="banner warn">App ist noch nicht mit der Datenbank verbunden (Supabase fehlt).</div>
	{/if}

	{#if result}
		<div class="banner ok">
			{#if result === 'sent'}
				Danke! Die Meldung wurde gespeichert.
			{:else}
				Du bist offline. Die Meldung wurde auf dem Gerät gespeichert und wird automatisch
				gesendet, sobald du wieder Verbindung hast.
			{/if}
		</div>
		<button class="full" onclick={reportAnother}>Weitere Meldung erfassen</button>
	{:else}
		{#if !online}
			<div class="banner warn">Offline – deine Meldung wird gespeichert und später gesendet.</div>
		{/if}
		{#if errorMsg}
			<div class="banner err">{errorMsg}</div>
		{/if}

		<h2>Welches Zelt?</h2>
		<div class="tent-grid">
			{#each TENTS as n}
				<button
					type="button"
					class="tent {selectedTent === n ? 'sel' : 'secondary'}"
					aria-pressed={selectedTent === n}
					onclick={() => (selectedTent = n)}
				>
					{n}
				</button>
			{/each}
		</div>

		<h2>Was ist beschädigt oder fehlt?</h2>
		{#if categories.length === 0}
			<p class="muted">Keine Schadenskategorien verfügbar.</p>
		{:else}
			<div class="cats">
				{#each categories as c (c.id)}
					<label class="cat {selectedCats.has(c.id) ? 'sel' : ''}">
						<input
							type="checkbox"
							checked={selectedCats.has(c.id)}
							onchange={() => toggleCat(c.id)}
						/>
						{c.label}
					</label>
				{/each}
			</div>
		{/if}

		<h2>Notiz (optional)</h2>
		<textarea bind:value={notes} placeholder="z. B. Stange links unten verbogen"></textarea>

		<h2>Foto (optional)</h2>
		{#if photoPreview}
			<img class="preview" src={photoPreview} alt="Vorschau" />
			<button class="secondary full" type="button" onclick={removePhoto}>Foto entfernen</button>
		{:else}
			<label class="btn secondary full" style="cursor: pointer;">
				{photoBusy ? 'Foto wird verarbeitet…' : 'Foto aufnehmen'}
				<input
					type="file"
					accept="image/*"
					capture="environment"
					onchange={onPhoto}
					style="display: none;"
				/>
			</label>
			{#if !online}
				<p class="muted">Das Foto wird mitgesendet, sobald du wieder online bist.</p>
			{/if}
		{/if}

		<div style="margin-top: 1.5rem;">
			<button class="full" disabled={!canSubmit} onclick={submit}>
				{busy ? 'Wird gesendet…' : 'Meldung senden'}
			</button>
		</div>
	{/if}
</main>

<style>
	.tent-grid {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 0.5rem;
	}
	.tent {
		min-height: 56px;
		padding: 0;
		font-size: 1.1rem;
		font-weight: 700;
	}
	.tent.sel {
		background: var(--green);
		color: #fff;
		border-color: var(--green);
	}
	.cats {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.cat {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-weight: 500;
		margin: 0;
		padding: 0.85rem 1rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		min-height: var(--touch);
	}
	.cat.sel {
		border-color: var(--green);
		background: #eef7f1;
	}
	.cat input {
		width: 22px;
		height: 22px;
		min-height: 0;
		flex: none;
	}
	.preview {
		width: 100%;
		border-radius: var(--radius);
		margin-bottom: 0.5rem;
	}
</style>
