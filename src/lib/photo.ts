const MAX_DIM = 1600;
const QUALITY = 0.8;

/**
 * Downscale and re-encode an image through a canvas. Re-encoding strips ALL metadata
 * (EXIF, GPS, timestamps) — important because reporters photograph damage at a children's
 * camp — and caps the upload size for slow/queued connections.
 */
export async function processPhoto(file: File): Promise<Blob> {
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
	const w = Math.max(1, Math.round(bitmap.width * scale));
	const h = Math.max(1, Math.round(bitmap.height * scale));

	if (typeof OffscreenCanvas !== 'undefined') {
		const canvas = new OffscreenCanvas(w, h);
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('2D-Kontext nicht verfügbar');
		ctx.drawImage(bitmap, 0, 0, w, h);
		bitmap.close();
		return canvas.convertToBlob({ type: 'image/jpeg', quality: QUALITY });
	}

	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('2D-Kontext nicht verfügbar');
	ctx.drawImage(bitmap, 0, 0, w, h);
	bitmap.close();
	return new Promise<Blob>((resolve, reject) =>
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht verarbeitet werden'))),
			'image/jpeg',
			QUALITY
		)
	);
}
