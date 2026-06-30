// Printable per-tent label: title "Zelt N" + a QR pointing at the reporter page (`/zelt/<id>`),
// a German call-to-action, and the plain URL as a scan-it-by-hand fallback. Generated client-side
// in the manager area (a one-page A6 PDF), so a Materialwart can print/replace a single sticker
// without re-running the bulk `scripts/generate-tent-qr.mjs`.
//
// jsPDF + qrcode are heavy and only needed on the (rare) button click, so they're dynamically
// imported inside downloadTentLabel — the manager route and the pure, unit-tested core below stay
// free of them.

export const LABEL_CTA = 'Schaden? Hier scannen und melden';

export type TentLabel = {
	title: string;
	/** Absolute reporter URL the QR encodes, e.g. https://zelt.pages.dev/zelt/1 */
	url: string;
	/** URL without the scheme, shown as a human-readable fallback under the QR. */
	urlDisplay: string;
	cta: string;
};

/**
 * Pure label-field builder (no browser/PDF deps) so it's unit-testable. `origin` is the app's own
 * origin (`window.location.origin`) with any trailing slash tolerated; the QR always targets the
 * canonical token-less reporter path `/zelt/<id>`.
 */
export function buildTentLabel(tentId: number, origin: string): TentLabel {
	const base = origin.replace(/\/+$/, '');
	const url = `${base}/zelt/${tentId}`;
	return {
		title: `Zelt ${tentId}`,
		url,
		urlDisplay: url.replace(/^https?:\/\//, ''),
		cta: LABEL_CTA
	};
}

/** Filename for the downloaded PDF, e.g. zelt-01-label.pdf (zero-padded to match the QR script). */
export function labelFileName(tentId: number): string {
	return `zelt-${String(tentId).padStart(2, '0')}-label.pdf`;
}

/**
 * Build and trigger download of a one-page A6 PDF label for the tent. Browser-only (uses jsPDF +
 * a QR data URL + an anchor download). Returns once the download has been triggered.
 */
export async function downloadTentLabel(tentId: number, origin: string): Promise<void> {
	const label = buildTentLabel(tentId, origin);
	const [{ jsPDF }, { default: QRCode }] = await Promise.all([import('jspdf'), import('qrcode')]);

	// Crisp QR: render at a high pixel density, place it as a square on the page.
	const qrDataUrl = await QRCode.toDataURL(label.url, {
		margin: 1,
		errorCorrectionLevel: 'M',
		width: 600
	});

	// A5 landscape, 210 × 148 mm — QR on the left, text block on the right.
	const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'landscape' });
	const pageH = doc.internal.pageSize.getHeight();

	const qrSize = 110;
	doc.addImage(qrDataUrl, 'PNG', 14, (pageH - qrSize) / 2, qrSize, qrSize);

	// Centre of the right-hand text column.
	const textX = 165;
	const textW = 80;

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(48);
	doc.text(label.title, textX, 56, { align: 'center' });

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(20);
	doc.text(label.cta, textX, 86, { align: 'center', maxWidth: textW });

	doc.setFont('helvetica', 'normal');
	doc.setFontSize(12);
	doc.text(label.urlDisplay, textX, 110, { align: 'center', maxWidth: textW });

	doc.save(labelFileName(tentId));
}
