import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { OutboxReport } from './types';

interface ZeltDB extends DBSchema {
	outbox: { key: string; value: OutboxReport };
}

let dbp: Promise<IDBPDatabase<ZeltDB>> | null = null;

function db(): Promise<IDBPDatabase<ZeltDB>> {
	if (!dbp) {
		// v3: the queued shape changed again — each item now carries its own photo Blob and the
		// report carries `reporter_name` (the single per-submission photo is gone). The queue is
		// transient and normally empty, so recreating the store on upgrade drops any stale entries.
		dbp = openDB<ZeltDB>('zelt', 3, {
			upgrade(d) {
				if (d.objectStoreNames.contains('outbox')) d.deleteObjectStore('outbox');
				d.createObjectStore('outbox', { keyPath: 'submission_id' });
			}
		});
	}
	return dbp;
}

export async function queueReport(r: OutboxReport): Promise<void> {
	await (await db()).put('outbox', r);
}

export async function allQueued(): Promise<OutboxReport[]> {
	return (await db()).getAll('outbox');
}

export async function removeQueued(id: string): Promise<void> {
	await (await db()).delete('outbox', id);
}

export async function queuedCount(): Promise<number> {
	return (await db()).count('outbox');
}
