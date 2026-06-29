#!/usr/bin/env node
// Generate one QR code per tent, encoding the clean per-tent reporter URL
//   <BASE_URL>/zelt/<n>
// for n = 1..COUNT. The reporter token is no longer in the URL — the app bundles it — so these
// URLs are permanent and never need reprinting when the token rotates.
//
// Usage:
//   npm i -D qrcode            # one-time: this script's only extra dependency
//   BASE_URL=https://zelt.pages.dev node scripts/generate-tent-qr.mjs   # writes SVGs to ./qr/
//
// Optional env: COUNT (default 20), OUTDIR (default ./qr).

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const BASE_URL = (process.env.BASE_URL ?? '').replace(/\/$/, '');
const COUNT = Number(process.env.COUNT ?? 20);
const OUTDIR = process.env.OUTDIR ?? 'qr';

if (!BASE_URL) {
	console.error('Set BASE_URL. Example:');
	console.error('  BASE_URL=https://zelt.pages.dev node scripts/generate-tent-qr.mjs');
	process.exit(1);
}

let QRCode;
try {
	QRCode = (await import('qrcode')).default;
} catch {
	console.error('Missing dependency "qrcode". Install it first:  npm i -D qrcode');
	process.exit(1);
}

await mkdir(OUTDIR, { recursive: true });

for (let n = 1; n <= COUNT; n++) {
	const url = `${BASE_URL}/zelt/${n}`;
	const svg = await QRCode.toString(url, { type: 'svg', margin: 2, errorCorrectionLevel: 'M' });
	const file = resolve(OUTDIR, `zelt-${String(n).padStart(2, '0')}.svg`);
	await writeFile(file, svg);
	console.log(`zelt ${n} → ${file}`);
}

console.log(`\nDone. ${COUNT} QR codes in ${resolve(OUTDIR)}/`);
