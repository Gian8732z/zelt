// Printable one-page info poster for camp: a short German explainer of how to report tent damage
// plus the *general* QR pointing at the token-less tent picker (`/melden`). A Materialwart prints it
// once per camp and hangs it up, so anyone can scan, pick their tent, and report — independent of the
// per-tent QR stickers (`tent-label.ts`).
//
// jsPDF + qrcode are heavy and only needed on the (rare) button click, so they're dynamically
// imported inside downloadInfoPoster — the manager route and the pure, unit-tested core below stay
// free of them.

export const POSTER_TITLE = 'Zeltschäden melden';
export const POSTER_INTRO =
	'Ist ein Zelt beschädigt? Scanne den QR-Code mit deinem Handy, wähle dein Zelt und melde den ' +
	'Schaden oder scanne direkt den QR-Code auf dem Zeltsack.';
export const POSTER_STEPS = [
	'QR-Code scannen',
	'Dein Zelt auswählen',
	'Schaden auswählen, optional Foto + Kommentar, absenden'
] as const;

export type InfoPoster = {
	title: string;
	intro: string;
	steps: readonly string[];
	/** Absolute URL the general QR encodes, e.g. https://zelt.pages.dev/melden */
	url: string;
	/** URL without the scheme, shown as a human-readable caption under the QR. */
	urlDisplay: string;
	/** Footer line, e.g. "Gromit · Sola 26" (camp omitted when blank). */
	footer: string;
};

/**
 * Pure poster-field builder (no browser/PDF deps) so it's unit-testable. `origin` is the app's own
 * origin (`window.location.origin`) with any trailing slash tolerated; the QR always targets the
 * token-less tent picker `/melden`. `camp` is the manager-entered camp name for the footer.
 */
export function buildInfoPoster(origin: string, camp: string): InfoPoster {
	const base = origin.replace(/\/+$/, '');
	const url = `${base}/melden`;
	const trimmedCamp = camp.trim();
	return {
		title: POSTER_TITLE,
		intro: POSTER_INTRO,
		steps: POSTER_STEPS,
		url,
		urlDisplay: url.replace(/^https?:\/\//, ''),
		footer: trimmedCamp ? `Gromit · ${trimmedCamp}` : 'Gromit'
	};
}

/** Filename for the downloaded PDF, e.g. zelt-info-sola-26.pdf (or zelt-info.pdf when camp is blank). */
export function posterFileName(camp: string): string {
	const slug = camp
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug ? `zelt-info-${slug}.pdf` : 'zelt-info.pdf';
}

/**
 * Build and trigger download of a one-page A4 portrait info poster. Browser-only (uses jsPDF +
 * a QR data URL + an anchor download). Returns once the download has been triggered.
 */
export async function downloadInfoPoster(origin: string, camp: string): Promise<void> {
	const poster = buildInfoPoster(origin, camp);
	const [{ jsPDF }, { default: QRCode }] = await Promise.all([import('jspdf'), import('qrcode')]);

	// Crisp QR: render at a high pixel density, place it as a square on the page.
	const qrDataUrl = await QRCode.toDataURL(poster.url, {
		margin: 1,
		errorCorrectionLevel: 'M',
		width: 800
	});

	// A4 portrait, 210 × 297 mm. Everything is centred on the page width.
	const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
	const pageW = doc.internal.pageSize.getWidth();
	const pageH = doc.internal.pageSize.getHeight();
	const cx = pageW / 2;

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(34);
	doc.text(poster.title, cx, 40, { align: 'center' });

	doc.setFont('helvetica', 'normal');
	doc.setFontSize(14);
	doc.text(poster.intro, cx, 56, { align: 'center', maxWidth: 160 });

	// Numbered steps, left-aligned within a centred block.
	doc.setFontSize(14);
	const stepsX = 35;
	let y = 88;
	for (const [i, step] of poster.steps.entries()) {
		doc.setFont('helvetica', 'bold');
		doc.text(`${i + 1}.`, stepsX, y);
		doc.setFont('helvetica', 'normal');
		doc.text(step, stepsX + 8, y, { maxWidth: 140 });
		y += 12;
	}

	// Large centred QR with the plain URL as a scan-by-hand caption.
	const qrSize = 90;
	doc.addImage(qrDataUrl, 'PNG', cx - qrSize / 2, y + 6, qrSize, qrSize);
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(12);
	doc.text(poster.urlDisplay, cx, y + qrSize + 16, { align: 'center' });

	// Footer pinned near the bottom.
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(12);
	doc.text(poster.footer, cx, pageH - 18, { align: 'center' });

	doc.save(posterFileName(camp));
}
