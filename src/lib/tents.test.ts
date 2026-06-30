import { describe, it, expect } from 'vitest';
import { nextTentId, validateNewTentId, canHardDelete, MAX_TENT_ID } from './tents';

describe('nextTentId', () => {
	it('returns one past the highest existing id', () => {
		expect(nextTentId([1, 2, 3, 20])).toBe(21);
	});
	it('ignores gaps and returns max+1, not the lowest free number', () => {
		expect(nextTentId([1, 5, 6])).toBe(7);
	});
	it('starts at 1 for an empty fleet', () => {
		expect(nextTentId([])).toBe(1);
	});
});

describe('validateNewTentId', () => {
	it('accepts a fresh number', () => {
		expect(validateNewTentId(21, [1, 2, 20])).toBeNull();
	});
	it('rejects a collision (including a retired id still in the roster)', () => {
		expect(validateNewTentId(20, [1, 20])).toMatch(/existiert bereits/);
	});
	it('rejects non-integers', () => {
		expect(validateNewTentId(3.5, [])).toMatch(/ganze Zahl/);
	});
	it('rejects out-of-range numbers', () => {
		expect(validateNewTentId(0, [])).toMatch(/zwischen 1 und/);
		expect(validateNewTentId(MAX_TENT_ID + 1, [])).toMatch(/zwischen 1 und/);
	});
});

describe('canHardDelete', () => {
	it('allows deleting a tent with no history', () => {
		expect(canHardDelete(0)).toBe(true);
	});
	it('forbids deleting a tent that has damage rows', () => {
		expect(canHardDelete(1)).toBe(false);
	});
});
