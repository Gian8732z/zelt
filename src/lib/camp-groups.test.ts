import { describe, it, expect } from 'vitest';
import { groupTents, INACTIVE_GROUP_LABEL } from './camp-groups';

describe('groupTents', () => {
	it('buckets tents by camp_group, ordering sections by lowest tent number', () => {
		const sections = groupTents([
			{ tent_id: 6, camp_group: 'TN-Zelter' },
			{ tent_id: 1, camp_group: 'Leiter*innenzelter' },
			{ tent_id: 5, camp_group: 'Venner*innenzelt' },
			{ tent_id: 2, camp_group: 'Leiter*innenzelter' }
		]);
		expect(sections.map((s) => s.name)).toEqual([
			'Leiter*innenzelter',
			'Venner*innenzelt',
			'TN-Zelter'
		]);
		expect(sections.every((s) => !s.inactive)).toBe(true);
	});

	it('sorts tents within a section by number', () => {
		const [section] = groupTents([
			{ tent_id: 3, camp_group: 'A' },
			{ tent_id: 1, camp_group: 'A' },
			{ tent_id: 2, camp_group: 'A' }
		]);
		expect(section.tents.map((t) => t.tent_id)).toEqual([1, 2, 3]);
	});

	it('collects ungrouped (null/blank) tents into a trailing inactive bucket', () => {
		const sections = groupTents([
			{ tent_id: 12, camp_group: null },
			{ tent_id: 1, camp_group: 'Leiter*innenzelter' },
			{ tent_id: 13, camp_group: '   ' } // whitespace-only counts as ungrouped
		]);
		expect(sections[0].name).toBe('Leiter*innenzelter');
		const last = sections.at(-1)!;
		expect(last.name).toBe(INACTIVE_GROUP_LABEL);
		expect(last.inactive).toBe(true);
		expect(last.tents.map((t) => t.tent_id)).toEqual([12, 13]);
	});

	it('emits no inactive bucket when every tent is grouped', () => {
		const sections = groupTents([{ tent_id: 1, camp_group: 'A' }]);
		expect(sections.some((s) => s.inactive)).toBe(false);
	});

	it('handles an empty fleet', () => {
		expect(groupTents([])).toEqual([]);
	});
});
