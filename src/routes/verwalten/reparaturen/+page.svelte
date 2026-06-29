<script lang="ts">
	import { onMount } from 'svelte';
	import { getSupabase } from '$lib/supabase';
	import { PHOTO_BUCKET } from '$lib/config';
	import { DAMAGE_STATUS_LABELS, type Damage } from '$lib/types';
	import { COMPONENTS, severity, SEVERITY_RANK } from '$lib/damage-types';

	type DamageRow = Damage & {
		tents: { camp_group: string | null; out_of_service: boolean } | null;
	};

	let allDamages = $state<DamageRow[]>([]);
	let loading = $state(true);
	let errorMsg = $state<string | null>(null);
	let photoUrls = $state<Record<string, string>>({});
	let busyId = $state<string | null>(null);

	// Inline-action state — only one damage open at a time.
	let resolveId = $state<string | null>(null);
	let resolveNote = $state('');
	let invalidConfirmId = $state<string | null>(null);

	// Filter / sort controls
	let filterStatus = $state('open');
	let filterComponent = $state('all');
	let sortMode = $state('dringlichkeit');

	const filtered = $derived.by(() => {
		let rows: DamageRow[] = allDamages;
		if (filterStatus !== 'all') rows = rows.filter((d) => d.status === filterStatus);
		if (filterComponent !== 'all') rows = rows.filter((d) => d.component === filterComponent);
		return [...rows].sort((a, b) => {
			if (sortMode === 'dringlichkeit') {
				const ra = SEVERITY_RANK[severity(a.component ?? '', a.damage_kind ?? '')];
				const rb = SEVERITY_RANK[severity(b.component ?? '', b.damage_kind ?? '')];
				if (ra !== rb) return ra - rb;
				return new Date(a.reported_at).getTime() - new Date(b.reported_at).getTime();
			}
			if (sortMode === 'neueste') {
				return new Date(b.reported_at).getTime() - new Date(a.reported_at).getTime();
			}
			if (sortMode === 'aelteste') {
				return new Date(a.reported_at).getTime() - new Date(b.reported_at).getTime();
			}
			// nach-zelt
			if (a.tent_id !== b.tent_id) return a.tent_id - b.tent_id;
			return new Date(a.reported_at).getTime() - new Date(b.reported_at).getTime();
		});
	});

	async function load() {
		const sb = getSupabase();
		if (!sb) return;
		loading = true;
		errorMsg = null;
		const { data, error } = await sb
			.from('damages')
			.select('*, tents(camp_group, out_of_service)')
			.order('reported_at', { ascending: false });
		loading = false;
		if (error) {
			errorMsg = error.message;
			return;
		}
		allDamages = (data ?? []) as DamageRow[];

		// Eagerly fetch signed URLs for all rows that carry a photo.
		const urls: Record<string, string> = {};
		await Promise.all(
			allDamages
				.filter((x) => x.photo_path)
				.map(async (x) => {
					const { data: sd } = await sb.storage
						.from(PHOTO_BUCKET)
						.createSignedUrl(x.photo_path as string, 3600);
					if (sd?.signedUrl) urls[x.report_id] = sd.signedUrl;
				})
		);
		photoUrls = urls;
	}

	onMount(load);

	function fmt(iso: string | null): string {
		if (!iso) return '';
		return new Date(iso).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' });
	}

	function sevClass(d: DamageRow): string {
		return severity(d.component ?? '', d.damage_kind ?? '');
	}

	function startResolve(d: DamageRow) {
		resolveId = d.report_id;
		resolveNote = '';
		invalidConfirmId = null;
	}

	function cancelResolve() {
		resolveId = null;
		resolveNote = '';
	}

	function startInvalid(d: DamageRow) {
		invalidConfirmId = d.report_id;
		resolveId = null;
		resolveNote = '';
	}

	function cancelInvalid() {
		invalidConfirmId = null;
	}

	async function confirmResolve(d: DamageRow) {
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
		if (error) {
			errorMsg = error.message;
			return;
		}
		resolveId = null;
		resolveNote = '';
		await load();
	}

	async function confirmInvalid(d: DamageRow) {
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
		if (error) {
			errorMsg = error.message;
			return;
		}
		invalidConfirmId = null;
		await load();
	}
</script>

<main>
	<h1>Reparaturliste</h1>
	{#if errorMsg}<div class="banner err">{errorMsg}</div>{/if}

	<div class="controls">
		<div class="control-group">
			<label for="filter-status">Status</label>
			<select id="filter-status" bind:value={filterStatus}>
				<option value="open">Offen</option>
				<option value="resolved">Erledigt</option>
				<option value="invalid">Ungültig</option>
				<option value="all">Alle</option>
			</select>
		</div>
		<div class="control-group">
			<label for="filter-comp">Komponente</label>
			<select id="filter-comp" bind:value={filterComponent}>
				<option value="all">Alle</option>
				{#each COMPONENTS as c (c.component)}
					<option value={c.component}>{c.label}</option>
				{/each}
			</select>
		</div>
		<div class="control-group">
			<label for="sort-mode">Sortierung</label>
			<select id="sort-mode" bind:value={sortMode}>
				<option value="dringlichkeit">Nach Dringlichkeit</option>
				<option value="neueste">Neueste</option>
				<option value="aelteste">Älteste</option>
				<option value="zelt">Nach Zelt</option>
			</select>
		</div>
	</div>

	{#if loading}
		<p class="muted">Laden…</p>
	{:else if filtered.length === 0}
		<p class="muted empty">Keine offenen Schäden – alles in Ordnung ✓</p>
	{:else}
		{#each filtered as d (d.report_id)}
			{@const sev = sevClass(d)}
			<div class="card damage sev-{sev}">
				<div class="row-header">
					<a class="tent-link" href={`/verwalten/zelt/${d.tent_id}`}>Zelt {d.tent_id}</a>
					<span class="status-pill {d.status}">{DAMAGE_STATUS_LABELS[d.status]}</span>
				</div>

				{#if (d.category_labels ?? []).length}
					<ul class="cats">
						{#each d.category_labels as label}
							<li>{label}{d.quantity && d.quantity > 1 ? ` ×${d.quantity}` : ''}</li>
						{/each}
					</ul>
				{/if}

				{#if d.notes}
					<p class="notes">{d.notes}</p>
				{/if}

				<p class="meta muted">
					{[d.camp, d.reporter_name ? `von ${d.reporter_name}` : null, fmt(d.reported_at)]
						.filter(Boolean)
						.join(' · ')}
				</p>

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
						<div class="inline-form">
							<textarea
								bind:value={resolveNote}
								placeholder="Was wurde repariert oder ersetzt? (optional)"
							></textarea>
							<div class="actions">
								<button disabled={busyId === d.report_id} onclick={() => confirmResolve(d)}>
									Erledigt
								</button>
								<button class="secondary" onclick={cancelResolve}>Abbrechen</button>
							</div>
						</div>
					{:else if invalidConfirmId === d.report_id}
						<div class="inline-form">
							<p class="confirm-question">Als ungültig markieren? (Spam/Duplikat)</p>
							<div class="actions">
								<button
									class="danger"
									disabled={busyId === d.report_id}
									onclick={() => confirmInvalid(d)}
								>
									Ungültig
								</button>
								<button class="secondary" onclick={cancelInvalid}>Abbrechen</button>
							</div>
						</div>
					{:else}
						<div class="actions">
							<button disabled={busyId === d.report_id} onclick={() => startResolve(d)}>
								Als erledigt markieren
							</button>
							<button
								class="secondary"
								disabled={busyId === d.report_id}
								onclick={() => startInvalid(d)}
							>
								Ungültig
							</button>
						</div>
					{/if}
				{/if}
			</div>
		{/each}
	{/if}
</main>

<style>
	main {
		/* local orange for 'mittel' severity — no global --orange exists */
		--orange: #e07522;
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-bottom: 1.25rem;
		align-items: flex-end;
	}
	.control-group {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		flex: 1;
		min-width: 130px;
	}
	.control-group label {
		font-size: 0.85rem;
		margin-bottom: 0;
	}
	.control-group select {
		min-height: 40px;
	}

	.empty {
		text-align: center;
		padding: 2.5rem 0;
		font-size: 1.05rem;
	}

	/* Severity-coded left border on each damage card */
	.card.damage {
		border-left: 4px solid transparent;
	}
	.card.sev-hoch {
		border-left-color: var(--red);
	}
	.card.sev-mittel {
		border-left-color: var(--orange);
	}
	.card.sev-niedrig {
		border-left-color: var(--grey);
	}

	.row-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.4rem;
	}
	.tent-link {
		font-size: 1.1rem;
		font-weight: 700;
		text-decoration: none;
		color: var(--green-dark);
	}
	.tent-link:hover {
		text-decoration: underline;
	}

	.status-pill {
		font-size: 0.8rem;
		font-weight: 700;
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		color: #fff;
		background: var(--grey);
		white-space: nowrap;
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
	.notes {
		margin: 0.25rem 0;
		font-size: 0.95rem;
	}
	.meta {
		font-size: 0.85rem;
		margin: 0.3rem 0 0;
	}
	.photo {
		display: block;
		width: 100%;
		max-height: 200px;
		object-fit: cover;
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
	.inline-form textarea {
		margin-bottom: 0.5rem;
	}
	.confirm-question {
		margin: 0 0 0.5rem;
		font-weight: 600;
	}
</style>
