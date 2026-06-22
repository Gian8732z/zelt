import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { OutboxReport } from './types';

interface ZeltDB extends DBSchema {
	outbox: { key: string; value: OutboxReport };
}

let dbp: Promise<IDBPDatabase<ZeltDB>> | null = null;

function db(): Promise<IDBPDatabase<ZeltDB>> {
	if (!dbp) {
		dbp = openDB<ZeltDB>('zelt', 1, {
			upgrade(d) {
				d.createObjectStore('outbox', { keyPath: 'report_id' });
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
