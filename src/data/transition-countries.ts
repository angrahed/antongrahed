/**
 * The 30 post-communist economies shown in Figure 1, with their position on the
 * tile map. Tiles are one square per economy, placed so that neighbours stay
 * roughly adjacent (columns run west to east, rows north to south).
 */

export type RegionId = "cas" | "ceb" | "eec" | "rus" | "see";

export const regionNames: Record<RegionId, string> = {
	cas: "Central Asia",
	ceb: "Central Europe and the Baltics",
	eec: "Eastern Europe and the Caucasus",
	rus: "Russia",
	see: "South-eastern Europe",
};

export interface TransitionCountry {
	iso3: string;
	name: string;
	region: RegionId;
	/** [column, row] on the tile map */
	tile: readonly [number, number];
}

export const TILE_COLUMNS = 9;
export const TILE_ROWS = 8;

export const transitionCountries: readonly TransitionCountry[] = [
	{ iso3: "EST", name: "Estonia", region: "ceb", tile: [3, 0] },
	{ iso3: "LVA", name: "Latvia", region: "ceb", tile: [3, 1] },
	{ iso3: "RUS", name: "Russia", region: "rus", tile: [5, 1] },
	{ iso3: "MNG", name: "Mongolia", region: "cas", tile: [8, 1] },
	{ iso3: "POL", name: "Poland", region: "ceb", tile: [2, 2] },
	{ iso3: "LTU", name: "Lithuania", region: "ceb", tile: [3, 2] },
	{ iso3: "BLR", name: "Belarus", region: "eec", tile: [4, 2] },
	{ iso3: "KAZ", name: "Kazakhstan", region: "cas", tile: [6, 2] },
	{ iso3: "CZE", name: "Czechia", region: "ceb", tile: [1, 3] },
	{ iso3: "SVK", name: "Slovak Republic", region: "ceb", tile: [2, 3] },
	{ iso3: "UKR", name: "Ukraine", region: "eec", tile: [3, 3] },
	{ iso3: "MDA", name: "Moldova", region: "eec", tile: [4, 3] },
	{ iso3: "UZB", name: "Uzbekistan", region: "cas", tile: [6, 3] },
	{ iso3: "KGZ", name: "Kyrgyz Republic", region: "cas", tile: [7, 3] },
	{ iso3: "SVN", name: "Slovenia", region: "ceb", tile: [0, 4] },
	{ iso3: "HRV", name: "Croatia", region: "ceb", tile: [1, 4] },
	{ iso3: "HUN", name: "Hungary", region: "ceb", tile: [2, 4] },
	{ iso3: "ROU", name: "Romania", region: "see", tile: [3, 4] },
	{ iso3: "GEO", name: "Georgia", region: "eec", tile: [5, 4] },
	{ iso3: "TKM", name: "Turkmenistan", region: "cas", tile: [6, 4] },
	{ iso3: "TJK", name: "Tajikistan", region: "cas", tile: [7, 4] },
	{ iso3: "BIH", name: "Bosnia and Herzegovina", region: "see", tile: [1, 5] },
	{ iso3: "SRB", name: "Serbia", region: "see", tile: [2, 5] },
	{ iso3: "BGR", name: "Bulgaria", region: "see", tile: [3, 5] },
	{ iso3: "ARM", name: "Armenia", region: "eec", tile: [5, 5] },
	{ iso3: "AZE", name: "Azerbaijan", region: "eec", tile: [6, 5] },
	{ iso3: "MNE", name: "Montenegro", region: "see", tile: [1, 6] },
	{ iso3: "XKX", name: "Kosovo", region: "see", tile: [2, 6] },
	{ iso3: "MKD", name: "North Macedonia", region: "see", tile: [3, 6] },
	{ iso3: "ALB", name: "Albania", region: "see", tile: [2, 7] },
];
