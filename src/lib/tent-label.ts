// Printable per-tent label: title "Zelt N" + a QR pointing at the reporter page (`/zelt/<id>`),
// a German call-to-action, and the plain URL as a scan-it-by-hand fallback. Generated client-side
// in the manager area (a one-page A6 PDF), so a Materialwart can print/replace a single sticker
// without re-running the bulk `scripts/generate-tent-qr.mjs`.

import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

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

	// Crisp QR: render at a high pixel density, place it as a square on the page.
	const qrDataUrl = await QRCode.toDataURL(label.url, {
		margin: 1,
		errorCorrectionLevel: 'M',
		width: 600
	});

	// A6 portrait, 105 × 148 mm — a tidy single sticker.
	const doc = new jsPDF({ unit: 'mm', format: 'a6' });
	const pageW = doc.internal.pageSize.getWidth();
	const center = pageW / 2;

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(34);
	doc.text(label.title, center, 24, { align: 'center' });

	const qrSize = 70;
	doc.addImage(qrDataUrl, 'PNG', center - qrSize / 2, 34, qrSize, qrSize);

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(14);
	doc.text(label.cta, center, 118, { align: 'center', maxWidth: pageW - 16 });

	doc.setFont('helvetica', 'normal');
	doc.setFontSize(10);
	doc.text(label.urlDisplay, center, 130, { align: 'center', maxWidth: pageW - 16 });

	doc.save(labelFileName(tentId));
}
