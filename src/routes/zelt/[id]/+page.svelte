<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { isConfigured, REPORTER_TOKEN } from '$lib/config';
	import { processPhoto } from '$lib/photo';
	import { submitReport } from '$lib/submit';
	import { fetchTentInfo, type TentInfo } from '$lib/tent-info';
	import {
		COMPONENTS,
		componentDef,
		damageMode,
		snapshotLabel,
		type ComponentKey,
		type DamageMode
	} from '$lib/damage-types';
	import { TENT_STATUS_LABELS, type DamageItem, type OutboxReport } from '$lib/types';

	const tentId = $derived(Number($page.params.id));

	const NAME_KEY = 'zelt:reporter_name';

	let info = $state<TentInfo | null>(null);
	let infoLoading = $state(true);
	let infoError = $state<string | null>(null);

	let reporterName = $state('');

	// Two-level form state. A "cell" is one (component, damage_kind) pair, keyed `${component}:${kind}`.
	let expanded = $state<ComponentKey | null>(null); // which component's submenu is open
	let selected = $state<Set<string>>(new Set());
	let quantities = $state<Record<string, number>>({});
	let descriptions = $state<Record<string, string>>({});
	// Per-item photo: a processed File ready to upload, plus an object-URL preview, keyed by cell id.
	let photos = $state<Record<string, File>>({});
	let photoPreviews = $state<Record<string, string>>({});
	let photoBusy = $state<Record<string, boolean>>({});

	let online = $state(true);
	let busy = $state(false);
	let result = $state<null | 'sent' | 'queued'>(null);
	let errorMsg = $state<string | null>(null);

	const cid = (component: string, kind: string) => `${component}:${kind}`;

	async function loadInfo() {
		infoLoading = true;
		infoError = null;
		try {
			info = await fetchTentInfo(tentId);
		} catch (e) {
			infoError =
				e instanceof Error && e.message === 'unauthorized'
					? 'Dieser Link ist ungültig oder abgelaufen.'
					: 'Status konnte nicht geladen werden.';
		} finally {
			infoLoading = false;
		}
	}

	onMount(() => {
		online = navigator.onLine;
		try {
			reporterName = localStorage.getItem(NAME_KEY) ?? '';
		} catch {
			// localStorage may be unavailable (private mode); the field just starts empty.
		}
		const on = () => (online = true);
		const off = () => (online = false);
		window.addEventListener('online', on);
		window.addEventListener('offline', off);
		if (isConfigured) loadInfo();
		else infoLoading = false;
		return () => {
			window.removeEventListener('online', on);
			window.removeEventListener('offline', off);
		};
	});

	function toggleExpand(component: ComponentKey) {
		expanded = expanded === component ? null : component;
	}

	function toggle(component: ComponentKey, mode: DamageMode) {
		const id = cid(component, mode.kind);
		const next = new Set(selected);
		if (next.has(id)) {
			next.delete(id);
			selected = next;
			return;
		}
		// `fehlt` is exclusive: the whole part is gone, so clear any other modes of this component;
		// conversely, picking any other mode clears a previously chosen `fehlt`.
		const def = componentDef(component);
		if (def) {
			for (const m of def.modes) {
				if (mode.exclusive || m.exclusive) next.delete(cid(component, m.kind));
			}
		}
		next.add(id);
		if (mode.input === 'count' && !quantities[id]) quantities = { ...quantities, [id]: 1 };
		selected = next;
	}

	/** How many modes are selected for a component (drives the header badge). */
	function countFor(component: string): number {
		let n = 0;
		for (const id of selected) if (id.startsWith(component + ':')) n++;
		return n;
	}

	async function onPhoto(id: string, e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		if (!file) return;
		photoBusy = { ...photoBusy, [id]: true };
		errorMsg = null;
		try {
			const blob = await processPhoto(file);
			photos = { ...photos, [id]: new File([blob], 'schaden.jpg', { type: 'image/jpeg' }) };
			if (photoPreviews[id]) URL.revokeObjectURL(photoPreviews[id]);
			photoPreviews = { ...photoPreviews, [id]: URL.createObjectURL(blob) };
		} catch {
			errorMsg = 'Foto konnte nicht verarbeitet werden.';
		} finally {
			photoBusy = { ...photoBusy, [id]: false };
		}
	}

	function removePhoto(id: string) {
		if (photoPreviews[id]) URL.revokeObjectURL(photoPreviews[id]);
		const p = { ...photos };
		delete p[id];
		photos = p;
		const pv = { ...photoPreviews };
		delete pv[id];
		photoPreviews = pv;
	}

	// A selected mode that requires a comment (Sonstiges) needs non-empty text to mean anything.
	const missingComment = $derived(
		[...selected].some((id) => {
			const [c, k] = id.split(':');
			return damageMode(c, k)?.commentRequired && !(descriptions[id] ?? '').trim();
		})
	);
	const anyPhotoBusy = $derived(Object.values(photoBusy).some(Boolean));
	const canSubmit = $derived(
		selected.size > 0 && !!reporterName.trim() && !busy && !anyPhotoBusy && !missingComment
	);

	async function submit() {
		if (!canSubmit) return;
		busy = true;
		errorMsg = null;
		try {
			localStorage.setItem(NAME_KEY, reporterName.trim());
		} catch {
			// non-fatal — the name just won't be remembered next time.
		}
		const items: DamageItem[] = [...selected].map((id) => {
			const [component, kind] = id.split(':');
			const m = damageMode(component, kind);
			return {
				report_id: crypto.randomUUID(),
				component,
				damage_kind: kind,
				label: snapshotLabel(component, kind),
				quantity: m?.input === 'count' ? Math.max(1, Math.trunc(quantities[id] ?? 1)) : null,
				description: (descriptions[id] ?? '').trim() || null,
				photo: photos[id] ?? null
			};
		});
		const report: OutboxReport = {
			submission_id: crypto.randomUUID(),
			token: REPORTER_TOKEN,
			tent_id: tentId,
			reporter_name: reporterName.trim(),
			items,
			reported_at: new Date().toISOString(),
			queued_at: Date.now()
		};
		try {
			result = await submitReport(report);
			if (result === 'sent' && isConfigured) loadInfo();
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Senden fehlgeschlagen.';
		} finally {
			busy = false;
		}
	}

	function reportAnother() {
		for (const url of Object.values(photoPreviews)) URL.revokeObjectURL(url);
		selected = new Set();
		quantities = {};
		descriptions = {};
		photos = {};
		photoPreviews = {};
		photoBusy = {};
		expanded = null;
		result = null;
		errorMsg = null;
	}

	function fmtQty(label: string, qty: number | null): string {
		return qty && qty > 1 ? `${label} (×${qty})` : label;
	}
</script>

<main>
	<h1>Zelt {tentId}</h1>

	{#if !isConfigured}
		<div class="banner warn">App ist noch nicht mit der Datenbank verbunden (Supabase fehlt).</div>
	{/if}

	<!-- Current status -->
	{#if infoLoading}
		<p class="muted">Status wird geladen…</p>
	{:else if infoError}
		<div class="banner warn">{infoError}</div>
	{:else if info}
		<div class="status-card {info.status}">
			<span class="status-pill {info.status}">{TENT_STATUS_LABELS[info.status]}</span>

			{#if info.open.length === 0}
				<p class="muted" style="margin: 0.5rem 0 0;">Keine offenen Schäden gemeldet.</p>
			{:else}
				<p style="margin: 0.5rem 0 0.25rem; font-weight: 600;">Bereits gemeldet:</p>
				<ul class="open-list">
					{#each info.open as d}
						<li>{fmtQty(d.label, d.quantity)}{d.description ? ` – ${d.description}` : ''}</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	<hr />

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
		<h2>Schaden melden</h2>

		<label class="name-field">
			Dein Name
			<input
				type="text"
				autocomplete="name"
				placeholder="Pfadiname"
				bind:value={reporterName}
			/>
		</label>

		<p class="muted" style="margin-top: 0;">Bauteil wählen, dann den Schaden ankreuzen.</p>
		{#if !online}
			<div class="banner warn">Offline – deine Meldung wird gespeichert und später gesendet.</div>
		{/if}
		{#if errorMsg}<div class="banner err">{errorMsg}</div>{/if}

		<div class="components">
			{#each COMPONENTS as comp (comp.component)}
				{@const n = countFor(comp.component)}
				<div class="component" class:open={expanded === comp.component}>
					<button
						type="button"
						class="comp-head"
						aria-expanded={expanded === comp.component}
						onclick={() => toggleExpand(comp.component)}
					>
						<span class="chev" aria-hidden="true">{expanded === comp.component ? '▾' : '▸'}</span>
						<span class="comp-name">{comp.label}</span>
						{#if n > 0}<span class="badge">{n}</span>{/if}
					</button>

					{#if expanded === comp.component}
						<div class="modes">
							{#each comp.modes as m (m.kind)}
								{@const id = cid(comp.component, m.kind)}
								<label class="mode {selected.has(id) ? 'sel' : ''}">
									<input
										type="checkbox"
										checked={selected.has(id)}
										onchange={() => toggle(comp.component, m)}
									/>
									{m.label}
								</label>
								{#if selected.has(id)}
									<div class="item-extra">
										{#if m.input === 'count'}
											<label class="sub">
												Anzahl:
												<input type="number" min="1" inputmode="numeric" bind:value={quantities[id]} />
											</label>
										{/if}
										<input
											class="sub-text"
											type="text"
											placeholder={m.commentRequired
												? 'Was genau? (Pflicht)'
												: 'Bemerkung (optional)'}
											bind:value={descriptions[id]}
										/>
										{#if photoPreviews[id]}
											<img class="preview" src={photoPreviews[id]} alt="Vorschau" />
											<button class="secondary full" type="button" onclick={() => removePhoto(id)}>
												Foto entfernen
											</button>
										{:else}
											<label class="btn secondary full" style="cursor: pointer;">
												{photoBusy[id] ? 'Foto wird verarbeitet…' : 'Foto aufnehmen'}
												<input
													type="file"
													accept="image/*"
													capture="environment"
													onchange={(e) => onPhoto(id, e)}
													style="display: none;"
												/>
											</label>
										{/if}
									</div>
								{/if}
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>

		{#if !reporterName.trim()}
			<p class="muted">Bitte gib deinen Namen an, bevor du sendest.</p>
		{/if}
		{#if missingComment}
			<p class="muted">Bitte beschreibe «Sonstiges» kurz, bevor du sendest.</p>
		{/if}

		<div style="margin-top: 1.5rem;">
			<button class="full" disabled={!canSubmit} onclick={submit}>
				{busy ? 'Wird gesendet…' : 'Meldung senden'}
			</button>
		</div>
	{/if}
</main>

<style>
	.status-card {
		border: 1px solid var(--border);
		border-left-width: 6px;
		border-radius: var(--radius);
		padding: 0.9rem 1rem;
		background: var(--surface);
	}
	.status-card.damaged {
		border-left-color: var(--red);
	}
	.status-card.active {
		border-left-color: var(--green);
	}
	.status-card.out_of_service {
		border-left-color: var(--grey);
	}
	.status-pill {
		font-size: 0.8rem;
		font-weight: 700;
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		color: #fff;
		background: var(--grey);
	}
	.status-pill.damaged {
		background: var(--red);
	}
	.status-pill.active {
		background: var(--green);
	}
	.open-list {
		margin: 0.25rem 0 0;
		padding-left: 1.1rem;
	}
	hr {
		border: none;
		border-top: 1px solid var(--border);
		margin: 1.5rem 0;
	}

	.name-field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-weight: 600;
		margin-bottom: 1rem;
	}
	.name-field input {
		width: 100%;
	}

	/* Two-level component picker */
	.components {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.component {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		overflow: hidden;
	}
	.component.open {
		border-color: var(--green);
	}
	.comp-head {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		margin: 0;
		padding: 0.85rem 1rem;
		background: none;
		border: none;
		font: inherit;
		font-weight: 600;
		color: var(--text);
		text-align: left;
		cursor: pointer;
		min-height: var(--touch);
	}
	.comp-name {
		flex: 1;
	}
	.chev {
		color: var(--text-muted);
		font-size: 0.9rem;
		width: 1rem;
	}
	.badge {
		flex: none;
		min-width: 1.4rem;
		text-align: center;
		font-size: 0.8rem;
		font-weight: 700;
		color: #fff;
		background: var(--green);
		border-radius: 999px;
		padding: 0.1rem 0.45rem;
	}
	.modes {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0 0.75rem 0.75rem;
	}
	.mode {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-weight: 500;
		margin: 0;
		padding: 0.7rem 0.85rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg, #fff);
		min-height: var(--touch);
	}
	.mode.sel {
		border-color: var(--green);
		background: #eef7f1;
	}
	.mode input {
		width: 22px;
		height: 22px;
		min-height: 0;
		flex: none;
	}
	.item-extra {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0 0 0.4rem 1rem;
	}
	.sub {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		color: var(--text-muted);
	}
	.sub input {
		width: 5rem;
	}
	.sub-text {
		width: 100%;
	}
	.preview {
		width: 100%;
		border-radius: var(--radius);
	}
</style>
