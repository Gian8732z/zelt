<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { getSupabase } from '$lib/supabase';
	import { PHOTO_BUCKET } from '$lib/config';
	import { DAMAGE_STATUS_LABELS, type Damage, type Tent } from '$lib/types';
	import { downloadTentLabel } from '$lib/tent-label';

	const tentId = $derived(Number($page.params.id));
	let labelBusy = $state(false);
	let tent = $state<Tent | null>(null);
	let damages = $state<Damage[]>([]);
	let photoUrls = $state<Record<string, string>>({});
	let loading = $state(true);
	let errorMsg = $state<string | null>(null);
	let busyId = $state<string | null>(null);

	// Inline action state — per-card
	let resolveId = $state<string | null>(null);
	let resolveNote = $state('');
	let invalidId = $state<string | null>(null);

	// Bulk resolve state
	let bulkOpen = $state(false);
	let bulkNote = $state('');
	let bulkBusy = $state(false);

	const openDamages = $derived(damages.filter((d) => d.status === 'open'));

	async function load() {
		const sb = getSupabase();
		if (!sb) return;
		loading = true;
		errorMsg = null;
		const [{ data: t, error: te }, { data: d, error: de }] = await Promise.all([
			sb.from('tents').select('*').eq('tent_id', tentId).single(),
			sb
				.from('damages')
				.select('*')
				.eq('tent_id', tentId)
				.order('reported_at', { ascending: false })
		]);
		loading = false;
		if (te || de) {
			errorMsg = (te ?? de)?.message ?? 'Fehler beim Laden';
			return;
		}
		tent = t as Tent;
		damages = (d ?? []) as Damage[];

		const urls: Record<string, string> = {};
		await Promise.all(
			damages
				.filter((x) => x.photo_path)
				.map(async (x) => {
					const { data } = await sb.storage
						.from(PHOTO_BUCKET)
						.createSignedUrl(x.photo_path as string, 3600);
					if (data?.signedUrl) urls[x.report_id] = data.signedUrl;
				})
		);
		photoUrls = urls;
	}

	onMount(load);

	async function resolve(d: Damage) {
		const sb = getSupabase();
		if (!sb) return;
		busyId = d.report_id;
		const { data: u } = await sb.auth.getUser();
		const { error } = await sb
			.from('damages')
			.update({
				status: 'resolved',
				resolution_timestamp: new Date().toISOString(),
				resolution_notes: resolveNote.trim() || null,
				resolved_by: u.user?.id ?? null
			})
			.eq('report_id', d.report_id);
		busyId = null;
		resolveId = null;
		resolveNote = '';
		if (error) {
			errorMsg = error.message;
			return;
		}
		await load();
	}

	async function markInvalid(d: Damage) {
		const sb = getSupabase();
		if (!sb) return;
		busyId = d.report_id;
		const { data: u } = await sb.auth.getUser();
		const { error } = await sb
			.from('damages')
			.update({
				status: 'invalid',
				resolution_timestamp: new Date().toISOString(),
				resolved_by: u.user?.id ?? null
			})
			.eq('report_id', d.report_id);
		busyId = null;
		invalidId = null;
		if (error) {
			errorMsg = error.message;
			return;
		}
		await load();
	}

	async function bulkResolve() {
		const sb = getSupabase();
		if (!sb) return;
		bulkBusy = true;
		const { data: u } = await sb.auth.getUser();
		const now = new Date().toISOString();
		const note = bulkNote.trim() || null;
		const ids = openDamages.map((d) => d.report_id);
		const { error } = await sb
			.from('damages')
			.update({
				status: 'resolved',
				resolution_timestamp: now,
				resolution_notes: note,
				resolved_by: u.user?.id ?? null
			})
			.in('report_id', ids);
		bulkBusy = false;
		bulkOpen = false;
		bulkNote = '';
		if (error) {
			errorMsg = error.message;
			return;
		}
		await load();
	}

	async function toggleService() {
		const sb = getSupabase();
		if (!sb || !tent) return;
		const { error } = await sb
			.from('tents')
			.update({ out_of_service: !tent.out_of_service })
			.eq('tent_id', tentId);
		if (error) {
			errorMsg = error.message;
			return;
		}
		await load();
	}

	async function makeLabel() {
		labelBusy = true;
		errorMsg = null;
		try {
			await downloadTentLabel(tentId, window.location.origin);
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'Etikett konnte nicht erstellt werden';
		} finally {
			labelBusy = false;
		}
	}

	function fmt(iso: string | null): string {
		if (!iso) return '';
		return new Date(iso).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' });
	}
</script>

<main>
	<p><a href="/verwalten">← Flotte</a></p>
	<h1>Zelt {tentId}</h1>
	{#if errorMsg}<div class="banner err">{errorMsg}</div>{/if}

	{#if loading}
		<p class="muted">Laden…</p>
	{:else}
		<div class="card service">
			<div>
				<strong>{tent?.out_of_service ? 'Ausser Betrieb' : 'In Betrieb'}</strong>
				<p class="muted" style="margin: 0.25rem 0 0;">
					Manuell gesetzt (z. B. eingelagert oder in Reparatur).
				</p>
			</div>
			<div class="service-actions">
				<button class="secondary" onclick={makeLabel} disabled={labelBusy}>
					{labelBusy ? 'Wird erstellt…' : 'QR'}
				</button>
				<button class={tent?.out_of_service ? 'danger' : 'secondary'} onclick={toggleService}>
					{tent?.out_of_service ? 'Wieder in Betrieb' : 'Ausser Betrieb setzen'}
				</button>
			</div>
		</div>

		<h2>Schadensverlauf</h2>

		{#if openDamages.length >= 2}
			<div class="card bulk-resolve">
				{#if !bulkOpen}
					<button
						class="secondary"
						onclick={() => {
							bulkOpen = true;
							bulkNote = '';
						}}
					>
						Alle ({openDamages.length}) Schäden dieses Zelts erledigen
					</button>
				{:else}
					<p class="bulk-label">
						<strong>Alle {openDamages.length} offenen Schäden als erledigt markieren</strong>
					</p>
					<textarea
						class="inline-note"
						placeholder="Was wurde repariert oder ersetzt? (optional, gilt für alle)"
						bind:value={bulkNote}
						rows="3"
					></textarea>
					<div class="actions">
						<button
							disabled={bulkBusy}
							onclick={bulkResolve}
						>
							{bulkBusy ? 'Wird gespeichert…' : `Alle ${openDamages.length} erledigen`}
						</button>
						<button
							class="secondary"
							disabled={bulkBusy}
							onclick={() => {
								bulkOpen = false;
								bulkNote = '';
							}}
						>
							Abbrechen
						</button>
					</div>
				{/if}
			</div>
		{/if}

		{#if damages.length === 0}
			<p class="muted">Keine Meldungen für dieses Zelt.</p>
		{:else}
			{#each damages as d (d.report_id)}
				<div class="card damage {d.status}">
					<div class="row">
						<span class="status-pill {d.status}">{DAMAGE_STATUS_LABELS[d.status]}</span>
						<span class="muted">
							{[d.camp, d.reporter_name ? `von ${d.reporter_name}` : null, fmt(d.reported_at)]
								.filter(Boolean)
								.join(' · ')}
						</span>
					</div>

					{#if d.category_labels.length}
						<ul class="cats">
							{#each d.category_labels as label}
								<li>{label}{d.quantity && d.quantity > 1 ? ` (×${d.quantity})` : ''}</li>
							{/each}
						</ul>
					{/if}

					{#if d.notes}<p>{d.notes}</p>{/if}

					{#if d.photo_path}
						{#if photoUrls[d.report_id]}
							<a href={photoUrls[d.report_id]} target="_blank" rel="noreferrer">
								<img class="photo" src={photoUrls[d.report_id]} alt="Schadensfoto" />
							</a>
						{:else}
							<p class="muted">Foto vorhanden.</p>
						{/if}
					{/if}

					{#if d.status === 'resolved'}
						<p class="muted resolved-note">
							Erledigt am {fmt(d.resolution_timestamp)}{d.resolution_notes
								? ` – ${d.resolution_notes}`
								: ''}
						</p>
					{/if}

					{#if d.status === 'open'}
						{#if resolveId === d.report_id}
							<!-- Inline resolve form -->
							<div class="inline-form">
								<textarea
									class="inline-note"
									placeholder="Was wurde repariert oder ersetzt? (optional)"
									bind:value={resolveNote}
									rows="3"
								></textarea>
								<div class="actions">
									<button
										disabled={busyId === d.report_id}
										onclick={() => resolve(d)}
									>
										{busyId === d.report_id ? 'Wird gespeichert…' : 'Erledigt'}
									</button>
									<button
										class="secondary"
										disabled={busyId === d.report_id}
										onclick={() => {
											resolveId = null;
											resolveNote = '';
										}}
									>
										Abbrechen
									</button>
								</div>
							</div>
						{:else if invalidId === d.report_id}
							<!-- Inline invalid confirm -->
							<div class="inline-form">
								<p class="inline-confirm-text">
									Als ungültig markieren? (Spam / Duplikat)
								</p>
								<div class="actions">
									<button
										class="danger"
										disabled={busyId === d.report_id}
										onclick={() => markInvalid(d)}
									>
										{busyId === d.report_id ? 'Wird gespeichert…' : 'Ungültig'}
									</button>
									<button
										class="secondary"
										disabled={busyId === d.report_id}
										onclick={() => (invalidId = null)}
									>
										Abbrechen
									</button>
								</div>
							</div>
						{:else}
							<!-- Default action buttons -->
							<div class="actions">
								<button
									disabled={busyId === d.report_id}
									onclick={() => {
										resolveNote = '';
										resolveId = d.report_id;
									}}
								>
									Als erledigt markieren
								</button>
								<button
									class="secondary"
									disabled={busyId === d.report_id}
									onclick={() => (invalidId = d.report_id)}
								>
									Ungültig
								</button>
							</div>
						{/if}
					{/if}
				</div>
			{/each}
		{/if}
	{/if}
</main>

<style>
	.service {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.service-actions {
		display: flex;
		gap: 0.5rem;
		flex: none;
	}
	.service button {
		flex: none;
		min-height: 44px;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}
	.damage.resolved,
	.damage.invalid {
		opacity: 0.7;
	}
	.status-pill {
		font-size: 0.8rem;
		font-weight: 700;
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		color: #fff;
		background: var(--grey);
	}
	.status-pill.open {
		background: var(--red);
	}
	.status-pill.resolved {
		background: var(--green);
	}
	.cats {
		margin: 0.25rem 0;
		padding-left: 1.1rem;
	}
	.photo {
		width: 100%;
		border-radius: var(--radius);
		margin-top: 0.5rem;
	}
	.resolved-note {
		margin: 0.5rem 0 0;
		font-size: 0.9rem;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
	.actions button {
		flex: 1;
		min-height: 44px;
	}
	.inline-form {
		margin-top: 0.75rem;
	}
	.inline-note {
		width: 100%;
		box-sizing: border-box;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border, #ccc);
		border-radius: var(--radius, 6px);
		font-size: 1rem;
		font-family: inherit;
		resize: vertical;
	}
	.inline-confirm-text {
		margin: 0 0 0.25rem;
		font-weight: 600;
	}
	.bulk-resolve {
		margin-bottom: 1rem;
	}
	.bulk-resolve > button {
		width: 100%;
		min-height: 44px;
	}
	.bulk-label {
		margin: 0 0 0.5rem;
	}
</style>
