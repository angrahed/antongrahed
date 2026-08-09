export type FilmPreviewOrientation = "landscape" | "portrait";

export interface FilmPreviewPool {
	landscape: readonly string[];
	portrait: readonly string[];
	wide: readonly string[];
}

export interface FilmPreviewSlot {
	id: "wide" | "portrait" | "architecture";
	pool: keyof FilmPreviewPool;
}

export const FILM_PREVIEW_STORAGE_KEY = "alternative-film-preview-selection:v1";

export const FILM_PREVIEW_SLOTS = [
	{ id: "wide", pool: "wide" },
	{ id: "portrait", pool: "portrait" },
	{ id: "architecture", pool: "landscape" },
] as const satisfies readonly FilmPreviewSlot[];

const randomIndex = (length: number, random: () => number) => {
	const sample = random();
	const boundedSample = Number.isFinite(sample)
		? Math.min(Math.max(sample, 0), 0.999_999_999_999)
		: 0;
	return Math.floor(boundedSample * length);
};

const unorderedSelectionsMatch = (left: readonly string[], right: readonly string[]) => {
	if (left.length !== right.length) return false;
	const sortedLeft = [...left].sort();
	const sortedRight = [...right].sort();
	return sortedLeft.every((id, index) => id === sortedRight[index]);
};

/**
 * Select one unique image for each home-film slot. If the random draw exactly
 * repeats the prior three-image set, replace one image so a stored set is never
 * repeated when another result exists. Slot order alone does not count as a
 * different result.
 */
export function selectFilmPreviewIds(
	pool: FilmPreviewPool,
	random: () => number,
	previousIds: readonly string[] = [],
): [string, string, string] {
	const normalizedPool: FilmPreviewPool = {
		landscape: [...new Set(pool.landscape.filter(Boolean))],
		portrait: [...new Set(pool.portrait.filter(Boolean))],
		wide: [...new Set(pool.wide.filter(Boolean))],
	};
	const selected: string[] = [];

	for (const slot of FILM_PREVIEW_SLOTS) {
		const available = normalizedPool[slot.pool].filter((id) => !selected.includes(id));
		if (available.length === 0) {
			throw new Error(`No unique film image is available in the ${slot.pool} pool for ${slot.id}.`);
		}
		selected.push(available[randomIndex(available.length, random)] as string);
	}

	if (!unorderedSelectionsMatch(selected, previousIds)) {
		return selected as [string, string, string];
	}

	const startingSlot = randomIndex(FILM_PREVIEW_SLOTS.length, random);
	for (let offset = 0; offset < FILM_PREVIEW_SLOTS.length; offset += 1) {
		const slotIndex = (startingSlot + offset) % FILM_PREVIEW_SLOTS.length;
		const slot = FILM_PREVIEW_SLOTS[slotIndex];
		if (!slot) continue;
		const idsUsedByOtherSlots = new Set(selected.filter((_, index) => index !== slotIndex));
		const alternatives = normalizedPool[slot.pool].filter(
			(id) => id !== selected[slotIndex] && !idsUsedByOtherSlots.has(id),
		);

		if (alternatives.length > 0) {
			selected[slotIndex] = alternatives[randomIndex(alternatives.length, random)] as string;
			return selected as [string, string, string];
		}
	}

	throw new Error("The film pool cannot produce a different three-image preview set.");
}
