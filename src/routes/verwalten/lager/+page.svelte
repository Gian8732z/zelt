<script lang="ts">
	import { onMount } from 'svelte';
	import { getSupabase } from '$lib/supabase';
	import { downloadInfoPoster } from '$lib/info-poster';

	// Once-per-camp setup: assign each tent to a group and flag the ones sitting in storage as
	// "Ausser Betrieb". A blank group + out-of-service renders a tent in the dimmed "Nicht im Lager"
	// bucket on both the reporter picker and the manager grid.
	interface EditRow {
		tent_id: number;
		camp_group: string; // '' = no group
		out_of_service: boolean;
	}

	let rows = $state<EditRow[]>([]);
	let loading = $state(true);
	let saving = $state(false);
	let errorMsg = $state<string | null>(null);
	let saved = $state(false);

	// Camp name for the printable info poster's footer. There's no client-readable camp value
	// (CURRENT_CAMP lives only in the melden function's env), so the manager sets it here; remembered
	// per device so it's typed once per camp.
	const CAMP_KEY = 'zelt:poster-camp';
	let camp = $state('Sola 26');
	let generating = $state(false);

	async function generatePoster() {
		generating = true;
		try {
			if (typeof localStorage !== 'undefined') localStorage.setItem(CAMP_KEY, camp.trim());
			await downloadInfoPoster(window.location.origin, camp);
		} finally {
			generating = false;
		}
	}

	// Existing group names, fed to a <datalist> so typing reuses a section instead of spawning a
	// near-duplicate ("TN-Zelter" vs "TN Zelter"). Reactive: a new name is offered to the other rows.
	const groupOptions = $derived(
		[...new Set(rows.map((r) => r.camp_group.trim()).filter(Boolean))].sort((a, b) =>
			a.localeCompare(b, 'de')
		)
	);

	async function load() {
		const sb = getSupabase();
		if (!sb) return;
		loading = true;
		errorMsg = null;
		const { data, error } = await sb
			.from('tents')
			.select('tent_id, camp_group, out_of_service')
			.order('tent_id');
		loading = false;
		if (error) {
			errorMsg = error.message;
			return;
		}
		rows = (data ?? []).map((t) => ({
			tent_id: t.tent_id,
			camp_group: t.camp_group ?? '',
			out_of_service: t.out_of_service
		}));
	}

	onMount(() => {
		const saved = localStorage.getItem(CAMP_KEY);
		if (saved) camp = saved;
		load();
	});

	async function save() {
		const sb = getSupabase();
		if (!sb) return;
		saving = true;
		errorMsg = null;
		saved = false;
		// upsert by tent_id updates only the listed columns, so label/notes/acquired_on are untouched.
		const payload = rows.map((r) => ({
			tent_id: r.tent_id,
			camp_group: r.camp_group.trim() || null,
			out_of_service: r.out_of_service
		}));
		const { error } = await sb.from('tents').upsert(payload, { onConflict: 'tent_id' });
		saving = false;
		if (error) {
			errorMsg = error.message;
			return;
		}
		saved = true;
	}
</script>

<main>
	<p><a href="/verwalten">← Übersicht</a></p>
	<h1>Lager einrichten</h1>
	<p class="muted">
		Weise jedem Zelt eine Gruppe zu. Zelte ohne Gruppe, die «Ausser Betrieb» sind, erscheinen
		ausgegraut («Nicht im Lager») – im Melde- wie im Verwaltungsbereich.
	</p>

	<div class="poster">
		<label class="camp">
			Lager-Name
			<input type="text" bind:value={camp} placeholder="z. B. Sola 26" />
		</label>
		<button class="secondary" onclick={generatePoster} disabled={generating}>
			{generating ? 'Erstelle PDF…' : 'Info-Plakat (PDF)'}
		</button>
		<span class="muted hint">Erklärung + QR-Code zum Aushängen.</span>
	</div>

	{#if errorMsg}<div class="banner err">{errorMsg}</div>{/if}

	{#if loading}
		<p class="muted">Laden…</p>
	{:else}
		<datalist id="camp-groups">
			{#each groupOptions as g}<option value={g}></option>{/each}
		</datalist>

		<div class="rows">
			{#each rows as row (row.tent_id)}
				<div class="row">
					<span class="num">Zelt {row.tent_id}</span>
					<input
						class="group"
						type="text"
						list="camp-groups"
						placeholder="— keine —"
						bind:value={row.camp_group}
						oninput={() => (saved = false)}
					/>
					<label class="ab">
						<input
							type="checkbox"
							bind:checked={row.out_of_service}
							onchange={() => (saved = false)}
						/>
						Ausser Betrieb
					</label>
				</div>
			{/each}
		</div>

		<div class="actions">
			<button onclick={save} disabled={saving}>{saving ? 'Speichern…' : 'Speichern'}</button>
			{#if saved}<span class="muted ok">Gespeichert ✓</span>{/if}
		</div>
	{/if}
</main>

<style>
	.poster {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 0.75rem;
		margin-top: 1rem;
		padding: 0.9rem;
		border: 1px solid var(--border, #ddd);
		border-radius: 8px;
	}
	.camp {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.85rem;
		color: var(--text-muted);
	}
	.camp input {
		min-height: 44px;
	}
	.poster button {
		min-height: 44px;
		padding: 0 1.2rem;
	}
	.hint {
		font-size: 0.8rem;
	}
	.rows {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 1rem;
	}
	.row {
		display: grid;
		grid-template-columns: 4.5rem 1fr auto;
		align-items: center;
		gap: 0.6rem;
	}
	.num {
		font-weight: 700;
	}
	.group {
		min-height: 44px;
		width: 100%;
	}
	.ab {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.85rem;
		color: var(--text-muted);
		white-space: nowrap;
	}
	.ab input {
		width: 1.1rem;
		height: 1.1rem;
	}
	.actions {
		position: sticky;
		bottom: 0;
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 1.25rem;
		padding: 0.75rem 0;
		background: var(--bg, var(--surface));
	}
	.actions button {
		min-height: 44px;
		padding: 0 1.2rem;
	}
	.ok {
		color: var(--green);
	}
</style>
