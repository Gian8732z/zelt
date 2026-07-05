// Printable tent labels: title "Zelt N" + a QR pointing at the reporter page (`/zelt/<id>`),
// a German call-to-action, and the plain URL as a scan-it-by-hand fallback. Generated client-side
// in the manager area, so a Materialwart can print/replace stickers without re-running the bulk
// `scripts/generate-tent-qr.mjs`. Two entry points share one `drawLabel` layout:
//   - downloadTentLabel(id)          — one A5-landscape sheet, a single label.
//   - downloadAllTentLabels(ids)     — the in-camp fleet, two A5 labels stacked per A4-portrait page
//                                      (cut the sheet in half → two labels).
//
// jsPDF + qrcode are heavy and only needed on the (rare) button click, so they're dynamically
// imported inside the download functions — the manager route and the pure, unit-tested core below
// stay free of them.

export const LABEL_CTA = 'Schaden? Hier scannen und melden';

/** A5-landscape tile: 210 mm wide × 148 mm tall. One label fills one tile; two tiles stack on A4. */
const TILE_H = 148;
/** QR edge in mm (was 110; shrunk 30% so the text block breathes). */
const QR_SIZE = 77;

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

/** Filename for a single downloaded PDF, e.g. zelt-01-label.pdf (zero-padded to match the QR script). */
export function labelFileName(tentId: number): string {
	return `zelt-${String(tentId).padStart(2, '0')}-label.pdf`;
}

/** Filename for the bulk "all in-camp tents" sheet. */
export const ALL_LABELS_FILE_NAME = 'zelt-etiketten.pdf';

/** Minimal shape of a Lager editor row — enough to decide which tents get a label. */
export type LabelTentRow = { tent_id: number; out_of_service: boolean; retired?: boolean };

/**
 * The tents that belong on the bulk label sheet: those physically in this camp — not marked
 * "Ausser Betrieb" (the flag the app reuses for "not in the Lager") and not retired. Returned as a
 * sorted list of tent numbers. Pure, so it's unit-testable and the component stays a thin caller.
 */
export function inCampLabelTentIds(rows: LabelTentRow[]): number[] {
	return rows
		.filter((r) => !r.out_of_service && !r.retired)
		.map((r) => r.tent_id)
		.sort((a, b) => a - b);
}

// A `jsPDF` instance — typed loosely so this module needn't import jsPDF's types at rest (it's a
// dynamic, browser-only dependency).
type Doc = {
	addImage: (data: string, fmt: string, x: number, y: number, w: number, h: number) => void;
	setFont: (family: string, style: string) => void;
	setFontSize: (size: number) => void;
	text: (text: string, x: number, y: number, opts?: Record<string, unknown>) => void;
};

/**
 * Draw one A5-landscape label into `doc` at a vertical `offsetY` (mm from the page top): QR on the
 * left, "Zelt N" + CTA + URL centred in the right-hand column. `offsetY` lets two labels stack on a
 * single A4-portrait page (0 for the top slot, 148 for the bottom).
 */
function drawLabel(doc: Doc, label: TentLabel, qrDataUrl: string, offsetY: number): void {
	doc.addImage(qrDataUrl, 'PNG', 14, offsetY + (TILE_H - QR_SIZE) / 2, QR_SIZE, QR_SIZE);

	// Centre of the right-hand text column (right of the smaller QR, which now ends near x=91).
	const textX = 150;
	const textW = 105;

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(48);
	doc.text(label.title, textX, offsetY + 56, { align: 'center' });

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(20);
	doc.text(label.cta, textX, offsetY + 86, { align: 'center', maxWidth: textW });

	doc.setFont('helvetica', 'normal');
	doc.setFontSize(12);
	doc.text(label.urlDisplay, textX, offsetY + 110, { align: 'center', maxWidth: textW });
}

// Crisp QR: render at a high pixel density; jsPDF scales the PNG down to the placed square.
async function renderQr(url: string): Promise<string> {
	const { default: QRCode } = await import('qrcode');
	return QRCode.toDataURL(url, { margin: 1, errorCorrectionLevel: 'M', width: 600 });
}

/**
 * Build and trigger download of a one-page A5-landscape PDF label for the tent. Browser-only (uses
 * jsPDF + a QR data URL + an anchor download). Returns once the download has been triggered.
 */
export async function downloadTentLabel(tentId: number, origin: string): Promise<void> {
	const label = buildTentLabel(tentId, origin);
	const [{ jsPDF }, qrDataUrl] = await Promise.all([import('jspdf'), renderQr(label.url)]);

	const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'landscape' });
	drawLabel(doc as unknown as Doc, label, qrDataUrl, 0);
	doc.save(labelFileName(tentId));
}

/**
 * Build and trigger download of the bulk label sheet: one multi-page A4-portrait PDF with two
 * A5-landscape labels stacked per page (top + bottom), so cutting each sheet in half yields two
 * labels. An odd tent count leaves the last page's bottom slot blank. No-ops on an empty list.
 */
export async function downloadAllTentLabels(tentIds: number[], origin: string): Promise<void> {
	if (tentIds.length === 0) return;
	const { jsPDF } = await import('jspdf');
	const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

	for (let i = 0; i < tentIds.length; i++) {
		const label = buildTentLabel(tentIds[i], origin);
		const qrDataUrl = await renderQr(label.url);
		if (i > 0 && i % 2 === 0) doc.addPage();
		drawLabel(doc as unknown as Doc, label, qrDataUrl, (i % 2) * TILE_H);
	}

	doc.save(ALL_LABELS_FILE_NAME);
}
