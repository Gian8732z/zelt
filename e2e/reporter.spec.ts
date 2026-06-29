import { test, expect } from '@playwright/test';

// These exercise the reporter flow end-to-end against the ephemeral local Supabase stack:
// the form writes through the `melden` Edge Function, so a green run proves the whole
// client → function → Postgres path (incl. the offline outbox, the riskiest piece).

test('submits a damage online and shows the confirmation', async ({ page }) => {
	await page.goto('/zelt/6');
	await expect(page.getByRole('heading', { name: 'Zelt 6' })).toBeVisible();

	await page.getByPlaceholder('Pfadiname').fill('E2E Tester');

	// Pick a component, then tick a damage mode in its submenu.
	await page.getByRole('button', { name: 'Aussenzelt' }).click();
	await page.getByText('Stoff gerissen').click();

	const send = page.getByRole('button', { name: 'Meldung senden' });
	await expect(send).toBeEnabled();
	await send.click();

	await expect(page.getByText('Die Meldung wurde gespeichert')).toBeVisible();
});

test('queues a report while offline, then syncs it on reconnect', async ({ page, context }) => {
	await page.goto('/zelt/7');
	await expect(page.getByRole('heading', { name: 'Zelt 7' })).toBeVisible();

	await page.getByPlaceholder('Pfadiname').fill('Offline Tester');
	await page.getByRole('button', { name: 'Stangen' }).click();
	await page.getByText('verbogen').click();

	// Go offline: submit must fall back to the IndexedDB outbox, not fail.
	await context.setOffline(true);
	await page.getByRole('button', { name: 'Meldung senden' }).click();
	await expect(page.getByText('auf dem Gerät gespeichert')).toBeVisible();

	// Reconnect: the outbox flushes on the `online` event / next app-open. Reload until the
	// freshly-synced damage appears in this tent's status (the flush + status-read race, so poll).
	await context.setOffline(false);
	await expect(async () => {
		await page.reload();
		await expect(page.getByText('Stangen – verbogen')).toBeVisible({ timeout: 5_000 });
	}).toPass({ timeout: 30_000 });
});
