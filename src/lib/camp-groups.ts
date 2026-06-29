// Camp grouping for the tent overview, shared by the reporter picker and the manager grid.
// Sections come from each tent's camp_group; tents without a group fall into a trailing
// "Nicht im Lager" bucket. Group order is derived from the lowest tent number in each group
// (Leiter min 1 → Venner 5 → TN 6), so there is no separate sort column to maintain.

export const INACTIVE_GROUP_LABEL = 'Nicht im Lager';

export interface TentGroupRow {
	tent_id: number;
	camp_group: string | null;
}

export interface TentSection<T extends TentGroupRow> {
	name: string; // a camp_group name, or INACTIVE_GROUP_LABEL for the ungrouped bucket
	inactive: boolean; // true only for the trailing "not in this camp" bucket
	tents: T[];
}

/** Bucket tents into ordered sections. Grouped sections are sorted by their lowest tent number and
 *  tents within a section by number; the ungrouped bucket (blank/NULL camp_group) always trails. */
export function groupTents<T extends TentGroupRow>(tents: T[]): TentSection<T>[] {
	const byGroup = new Map<string, T[]>();
	const ungrouped: T[] = [];

	for (const t of tents) {
		const name = t.camp_group?.trim();
		if (name) {
			const list = byGroup.get(name) ?? [];
			list.push(t);
			byGroup.set(name, list);
		} else {
			ungrouped.push(t);
		}
	}

	const byTentId = (a: TentGroupRow, b: TentGroupRow) => a.tent_id - b.tent_id;

	const sections: TentSection<T>[] = [...byGroup.entries()]
		.map(([name, list]) => ({ name, inactive: false, tents: list.sort(byTentId) }))
		.sort((a, b) => a.tents[0].tent_id - b.tents[0].tent_id);

	if (ungrouped.length) {
		sections.push({ name: INACTIVE_GROUP_LABEL, inactive: true, tents: ungrouped.sort(byTentId) });
	}

	return sections;
}
