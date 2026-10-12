/**
 * The transition story: one set of 30 marks, one per economy, that moves between
 * scenes as the reader scrolls. Each scene is a pure function of the data and the
 * plot's size in pixels, so the client lays it out again on resize.
 */

import type { RegionId } from "@/data/transition-countries";
import { regionNames, TILE_COLUMNS, TILE_ROWS } from "@/data/transition-countries";
import { basemapSize, projectLonLat } from "@/lib/geo";
import { alignedSeries, countries, type Series, seriesFor, years } from "@/lib/transition";

export type SceneId =
	| "catchup"
	| "depth"
	| "fall"
	| "geo"
	| "leaving"
	| "lifespan"
	| "mortality"
	| "now"
	| "people"
	| "prices"
	| "recovery"
	| "reversals"
	| "roads-1995"
	| "roads-2007"
	| "tiles"
	| "war";

/** The drawing area in pixels; `base` is the default mark radius. */
export interface Frame {
	base: number;
	compact: boolean;
	height: number;
	width: number;
}

export interface Mark {
	dim?: boolean;
	hidden?: boolean;
	/** Open circle: the value is a lower bound. */
	hollow?: boolean;
	r: number;
	/** Outlined: a member of the European Union in the scene's year. */
	ring?: boolean;
	x: number;
	y: number;
}

export interface Callout {
	iso: string;
	/** Preferred side; the client falls back to another side if this one is crowded. */
	side?: "above" | "below" | "left" | "right";
	text: string;
}

export interface Tick {
	label: string;
	pos: number;
	strong?: boolean;
}

export interface Scene {
	callouts: Callout[];
	ghosts?: { iso: string; r: number; x: number; y: number }[];
	lines?: { d: string; iso: string; strong: boolean }[];
	links?: { iso: string; x1: number; x2: number; y1: number; y2: number }[];
	map?: { height: number; width: number; x: number; y: number };
	marks: Record<string, Mark>;
	notes?: { anchor?: "end" | "middle" | "start"; text: string; x: number; y: number }[];
	rows?: { iso: string; label: string; x: number; y: number }[];
	rules?: { label?: string; x1: number; x2: number; y1: number; y2: number }[];
	/** What the chart shows, above the stage. */
	title: string;
	xTicks?: { ticks: Tick[]; y: number };
	yTicks?: { ticks: Tick[]; x: number };
}

/* ---------- data ---------- */

const regionOf = new Map(countries.map((country) => [country.iso3, country.region]));
export const regionFor = (iso: string): RegionId => regionOf.get(iso) ?? "ceb";
export const regionOrder: readonly RegionId[] = ["ceb", "see", "eec", "rus", "cas"];
export const regionLabel: Record<RegionId, string> = {
	...regionNames,
	cas: "Central Asia and Mongolia",
};

const SHORT_NAMES: Record<string, string> = {
	BIH: "Bosnia and Herz.",
	KGZ: "Kyrgyz Republic",
	MKD: "North Macedonia",
	SVK: "Slovak Republic",
};
const nameOf = new Map(countries.map((country) => [country.iso3, country.name]));
export const nameFor = (iso: string) => nameOf.get(iso) ?? iso;
const shortName = (iso: string, compact: boolean) =>
	compact ? (SHORT_NAMES[iso] ?? nameFor(iso)) : nameFor(iso);

const isos = countries.map((country) => country.iso3);
const yearAt = (year: number) => years.indexOf(year);
const yearOf = (index: number): number => years[index] ?? 0;
const LAST = years.length - 1;
const LAST_YEAR = yearOf(LAST);
const at = (series: Series | undefined, year: number) => series?.[yearAt(year)] ?? null;
const lastValue = (series: Series | undefined) => {
	for (let index = (series?.length ?? 0) - 1; index >= 0; index -= 1) {
		const value = series?.[index];
		if (value != null) return { index, value };
	}
	return null;
};

const gdppc = seriesFor("gdppc");
const gdpIndex = seriesFor("index");
const life = seriesFor("lifeexp");
const democracy = seriesFor("democracy");
const gapG7 = seriesFor("gap-g7");
const population = alignedSeries("population");

/**
 * No comparable GDP per capita for 1990: Bosnia and Herzegovina's World Bank series for the
 * early 1990s implies it was richer after the war than before it; the others start later.
 */
export const NO_1990 = new Set(["BIH", "MNE", "SRB", "XKX"]);
const comparable = isos.filter((iso) => !NO_1990.has(iso));

/** Lowest GDP per capita relative to 1990 (by 2000), and the year output first got back to 1990. */
const trough = Object.fromEntries(
	comparable.map((iso) => {
		const series = gdpIndex[iso] ?? [];
		let low = Number.POSITIVE_INFINITY;
		let lowIndex = 0;
		series.forEach((value, index) => {
			if (value != null && yearOf(index) <= 2000 && value < low) {
				low = value;
				lowIndex = index;
			}
		});
		const back = series.findIndex(
			(value, index) => index > lowIndex && value != null && value >= 100,
		);
		return [iso, { back: back === -1 ? null : yearOf(back), index: lowIndex, value: low }];
	}),
) as Record<string, { back: number | null; index: number; value: number }>;

/** World Bank CPI inflation, with gaps filled from the IMF World Economic Outlook. */
const inflationWdi = alignedSeries("inflation");
const inflationImf = alignedSeries("inflation_imf");
const inflation = Object.fromEntries(
	isos.map((iso) => [
		iso,
		years.map((_, index) => inflationWdi[iso]?.[index] ?? inflationImf[iso]?.[index] ?? null),
	]),
) as Record<string, Series>;

/**
 * Year prices were largely freed: 1990 for Poland, Hungary and the Yugoslav successors,
 * 1991 for Czechoslovakia, Bulgaria, Romania, Albania and Mongolia, 1992 in the former Soviet Union.
 */
const REFORM_YEAR: Record<string, number> = {
	ALB: 1991,
	BGR: 1991,
	CZE: 1991,
	HUN: 1990,
	MNG: 1991,
	POL: 1990,
	ROU: 1991,
	SVK: 1991,
};
const reformYear = (iso: string) =>
	REFORM_YEAR[iso] ??
	(["BIH", "HRV", "MKD", "MNE", "SRB", "SVN", "XKX"].includes(iso) ? 1990 : 1992);

/** Peak annual inflation in the 1990s; data starting after reform make it a lower bound. */
const inflationPeak = Object.fromEntries(
	isos.flatMap((iso) => {
		const series = inflation[iso] ?? [];
		const first = series.findIndex((value) => value != null);
		if (first === -1 || yearOf(first) > reformYear(iso) + 2) return [];
		let peak = Number.NEGATIVE_INFINITY;
		let peakYear = 0;
		series.forEach((value, index) => {
			if (value != null && yearOf(index) <= 1999 && value > peak) {
				peak = value;
				peakYear = yearOf(index);
			}
		});
		return [[iso, { lowerBound: yearOf(first) > reformYear(iso), value: peak, year: peakYear }]];
	}),
) as Record<string, { lowerBound: boolean; value: number; year: number }>;
/** Economies left out of the inflation chapter for want of early-1990s data. */
export const NO_EARLY_INFLATION = isos.filter((iso) => !inflationPeak[iso]);

const lifeChange = Object.fromEntries(
	isos.map((iso) => [iso, (at(life[iso], 1995) ?? 0) - (at(life[iso], 1990) ?? 0)]),
);
const popLast = lastValue(population.POL)?.index ?? LAST;
export const POPULATION_YEAR = yearOf(popLast);
const popChange = Object.fromEntries(
	isos.map((iso) => {
		const start = population[iso]?.[0];
		const end = population[iso]?.[popLast];
		return [iso, start && end ? 100 * (end / start - 1) : 0];
	}),
);

const EU_2004 = ["CZE", "EST", "HUN", "LTU", "LVA", "POL", "SVK", "SVN"];
const EU_2007 = ["BGR", "ROU"];
const EU_2013 = ["HRV"];
const euMembers = (year: number) =>
	new Set([
		...(year >= 2004 ? EU_2004 : []),
		...(year >= 2007 ? EU_2007 : []),
		...(year >= 2013 ? EU_2013 : []),
	]);

/** Capitals, for the opening map (Astana for Kazakhstan). */
const CAPITALS: Record<string, [number, number]> = {
	ALB: [19.82, 41.33],
	ARM: [44.51, 40.18],
	AZE: [49.87, 40.41],
	BGR: [23.32, 42.7],
	BIH: [18.41, 43.86],
	BLR: [27.56, 53.9],
	CZE: [14.42, 50.08],
	EST: [24.75, 59.44],
	GEO: [44.79, 41.72],
	HRV: [15.98, 45.81],
	HUN: [19.04, 47.5],
	KAZ: [71.45, 51.17],
	KGZ: [74.59, 42.87],
	LTU: [25.28, 54.69],
	LVA: [24.11, 56.95],
	MDA: [28.86, 47.01],
	MKD: [21.43, 42.0],
	MNE: [19.26, 42.44],
	MNG: [106.92, 47.92],
	POL: [21.01, 52.23],
	ROU: [26.1, 44.43],
	RUS: [37.62, 55.76],
	SRB: [20.46, 44.79],
	SVK: [17.11, 48.15],
	SVN: [14.51, 46.06],
	TJK: [68.79, 38.56],
	TKM: [58.38, 37.95],
	UKR: [30.52, 50.45],
	UZB: [69.24, 41.3],
	XKX: [21.17, 42.66],
};

/* ---------- numbers in callouts ---------- */

const grouped = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
const MINUS = "−";
const signed = (value: number, digits = 0, unit = "") => {
	const rounded = Number(value.toFixed(digits));
	const sign = rounded > 0 ? "+" : rounded < 0 ? MINUS : "";
	return `${sign}${Math.abs(rounded).toFixed(digits)}${unit}`;
};
const millions = (value: number) =>
	`${value < 1e6 ? (value / 1e6).toFixed(1) : grouped.format(value / 1e6)}m`;

/* ---------- scales and geometry ---------- */

interface Box {
	bottom: number;
	left: number;
	right: number;
	top: number;
}
const inset = (frame: Frame, margin: Partial<Box>): Box => ({
	bottom: frame.height - (margin.bottom ?? 0),
	left: margin.left ?? 0,
	right: frame.width - (margin.right ?? 0),
	top: margin.top ?? 0,
});
const linear =
	([d0, d1]: [number, number], [r0, r1]: [number, number]) =>
	(value: number) =>
		r0 + ((value - d0) / (d1 - d0 || 1)) * (r1 - r0);
const logScale = ([d0, d1]: [number, number], range: [number, number]) => {
	const scale = linear([Math.log10(d0), Math.log10(d1)], range);
	return (value: number) => scale(Math.log10(Math.max(value, 1e-9)));
};
const round = (value: number) => Math.round(value * 10) / 10;

const pathOf = (
	series: Series,
	x: (year: number) => number,
	y: (value: number) => number,
	[from, to]: [number, number],
) => {
	let d = "";
	let pen = false;
	series.forEach((value, index) => {
		const year = yearOf(index);
		if (year < from || year > to || value == null) {
			pen = false;
			return;
		}
		d += `${pen ? "L" : "M"}${round(x(year))} ${round(y(value))}`;
		pen = true;
	});
	return d;
};

const hideAll = (): Record<string, Mark> =>
	Object.fromEntries(isos.map((iso) => [iso, { hidden: true, r: 0, x: 0, y: 0 }]));

/** Dims every mark not in `focus`. */
const withFocus = (marks: Record<string, Mark>, focus: readonly string[]) => {
	for (const [iso, mark] of Object.entries(marks)) if (!focus.includes(iso)) mark.dim = true;
	return marks;
};

/** Ranked rows: one row per economy, sorted, with its name on the left. */
const rowsFor = (frame: Frame, order: string[], box: Box) => {
	const step = (box.bottom - box.top) / order.length;
	return {
		r: Math.min(frame.base * 0.78, step * 0.4),
		rows: order.map((iso, index) => ({
			iso,
			label: shortName(iso, frame.compact),
			x: box.left - 10,
			y: box.top + (index + 0.5) * step,
		})),
		y: (iso: string) => box.top + (order.indexOf(iso) + 0.5) * step,
	};
};
const rowMargin = (frame: Frame) => ({
	bottom: 30,
	left: frame.compact ? 104 : 136,
	right: frame.compact ? 14 : 28,
	top: 8,
});

/* ---------- scenes ---------- */

/** Prologue: each economy at its capital on a dot-matrix map. */
const geo = (frame: Frame): Scene => {
	const [x0, y0] = projectLonLat(11, 61.5);
	const [x1, y1] = projectLonLat(110, 35.5);
	const scale = Math.min((frame.width * 0.96) / (x1 - x0), (frame.height * 0.92) / (y1 - y0));
	const dx = (frame.width - (x1 - x0) * scale) / 2 - x0 * scale;
	const dy = (frame.height - (y1 - y0) * scale) / 2 - y0 * scale;
	const size = basemapSize();
	const marks = hideAll();
	for (const iso of isos) {
		const [lon, lat] = CAPITALS[iso] ?? [0, 0];
		const [x, y] = projectLonLat(lon, lat);
		marks[iso] = { r: Math.max(3, frame.base * 0.42), x: x * scale + dx, y: y * scale + dy };
	}
	return {
		callouts: [
			{ iso: "SVN", text: "Slovenia" },
			{ iso: "EST", text: "Estonia" },
			{ iso: "MNG", text: "Mongolia" },
		],
		map: { height: size.height * scale, width: size.width * scale, x: dx, y: dy },
		marks,
		title: "Thirty economies, each at its capital",
	};
};

const grid = (frame: Frame) => {
	const cell = Math.min(frame.width / TILE_COLUMNS, frame.height / TILE_ROWS) * 0.98;
	const left = (frame.width - cell * TILE_COLUMNS) / 2;
	const top = (frame.height - cell * TILE_ROWS) / 2;
	return {
		cell,
		centre: (iso: string) => {
			const [column, row] = countries.find((country) => country.iso3 === iso)?.tile ?? [0, 0];
			return { x: left + (column + 0.5) * cell, y: top + (row + 0.5) * cell };
		},
	};
};

/** One circle per economy, neighbours kept roughly together (the tile map of Figure 1). */
const tiles = (frame: Frame): Scene => {
	const { cell, centre } = grid(frame);
	return {
		callouts: [],
		marks: Object.fromEntries(isos.map((iso) => [iso, { r: cell * 0.42, ...centre(iso) }])),
		title: "One circle per economy, coloured by region",
	};
};

/** The same grid with each circle's area proportional to its 1990 population. */
const people = (frame: Frame): Scene => {
	const { cell, centre } = grid(frame);
	const largest = Math.max(...isos.map((iso) => population[iso]?.[0] ?? 0));
	return {
		callouts: ["RUS", "UKR", "POL", "MNE"].map((iso) => ({
			iso,
			text: `${nameFor(iso)}, ${millions(population[iso]?.[0] ?? 0)}`,
		})),
		marks: Object.fromEntries(
			isos.map((iso) => [
				iso,
				{
					r: Math.max(2.5, cell * 0.95 * Math.sqrt((population[iso]?.[0] ?? 0) / largest)),
					...centre(iso),
				},
			]),
		),
		title: "Circle area in proportion to population, 1990",
	};
};

/** Chapter I: GDP per capita relative to 1990, each mark at its economy's lowest point. */
const fall = (frame: Frame): Scene => {
	const box = inset(frame, { bottom: 30, left: 40, right: 18, top: 12 });
	const x = linear([1990, 2000], [box.left, box.right]);
	const highest = Math.max(
		...comparable.flatMap((iso) =>
			(gdpIndex[iso] ?? []).filter(
				(value, index): value is number => value != null && yearOf(index) <= 2000,
			),
		),
	);
	const top = Math.ceil(highest / 20) * 20;
	const y = linear([20, top], [box.bottom, box.top]);
	const focus = ["GEO", "UKR", "POL"];
	const marks = hideAll();
	for (const iso of comparable) {
		const low = trough[iso];
		if (low) marks[iso] = { r: frame.base * 0.72, x: x(yearOf(low.index)), y: y(low.value) };
	}
	return {
		callouts: [
			{ iso: "GEO", text: `Georgia ${signed((trough.GEO?.value ?? 100) - 100, 0, "%")}` },
			{ iso: "UKR", text: `Ukraine ${signed((trough.UKR?.value ?? 100) - 100, 0, "%")}` },
			{ iso: "POL", text: `Poland ${signed((trough.POL?.value ?? 100) - 100, 0, "%")}` },
		],
		lines: comparable.map((iso) => ({
			d: pathOf(gdpIndex[iso] ?? [], x, y, [1990, 2000]),
			iso,
			strong: focus.includes(iso),
		})),
		marks: withFocus(marks, focus),
		rules: [{ label: "1990 = 100", x1: box.left, x2: box.right, y1: y(100), y2: y(100) }],
		title: "GDP per capita at PPP, 1990 = 100. Each circle at its lowest point",
		xTicks: {
			ticks: [1990, 1992, 1994, 1996, 1998, 2000].map((year) => ({
				label: String(year),
				pos: x(year),
			})),
			y: box.bottom,
		},
		yTicks: {
			ticks: Array.from({ length: (top - 20) / 20 + 1 }, (_, k) => 20 + 20 * k).map((value) => ({
				label: String(value),
				pos: y(value),
				strong: value === 100,
			})),
			x: box.left,
		},
	};
};

/** How far output per person fell, ranked. */
const depth = (frame: Frame): Scene => {
	const box = inset(frame, rowMargin(frame));
	const order = [...comparable].sort((a, b) => (trough[a]?.value ?? 0) - (trough[b]?.value ?? 0));
	const rows = rowsFor(frame, order, box);
	const x = linear([0, 80], [box.left, box.right]);
	const marks = hideAll();
	for (const iso of order) {
		marks[iso] = { r: rows.r, x: x(100 - (trough[iso]?.value ?? 100)), y: rows.y(iso) };
	}
	const focus = ["GEO", "TJK", "MDA", "POL"];
	return {
		callouts: focus.map((iso) => ({
			iso,
			text: signed((trough[iso]?.value ?? 100) - 100, 0, "%"),
		})),
		marks: withFocus(marks, focus),
		rows: rows.rows,
		xTicks: {
			ticks: [0, 20, 40, 60, 80].map((value) => ({
				label: value === 0 ? "0" : `${MINUS}${value}%`,
				pos: x(value),
			})),
			y: box.bottom,
		},
		title: "Fall in GDP per capita from 1990 to its lowest point",
	};
};

/** The year each economy first produced as much per person as in 1990. */
const recovery = (frame: Frame): Scene => {
	const box = inset(frame, { bottom: 30, left: 14, right: 18, top: 12 });
	const NOT_YET = 2028.5;
	const x = linear([1992, 2031], [box.left, box.right]);
	const r = frame.base * (frame.compact ? 1 : 1.05);
	// Stacks are at most a few high, so the axis sits below the middle rather than at the foot.
	const baseline = box.top + (box.bottom - box.top) * 0.64;
	const stacks = new Map<number, number>();
	const marks = hideAll();
	const order = [...comparable].sort(
		(a, b) => (trough[a]?.back ?? NOT_YET) - (trough[b]?.back ?? NOT_YET),
	);
	for (const iso of order) {
		const year = trough[iso]?.back ?? NOT_YET;
		const level = stacks.get(year) ?? 0;
		stacks.set(year, level + 1);
		marks[iso] = { r, x: x(year), y: baseline - r - 2 - level * (2 * r + 3) };
	}
	const focus = ["POL", "GEO", "MDA", "UKR"];
	return {
		callouts: [
			{ iso: "POL", text: "Poland, 1994" },
			{ iso: "GEO", text: "Georgia, 2012" },
			// Two labels do not fit at the right-hand end on a phone.
			...(frame.compact ? [] : [{ iso: "MDA", text: "Moldova, 2023" }]),
			{ iso: "UKR", side: "above", text: "Ukraine, not yet" },
		],
		marks: withFocus(marks, focus),
		rules: [
			{
				label: "Median: 2003",
				x1: x(2003),
				x2: x(2003),
				y1: baseline - 7 * (2 * r + 3),
				y2: baseline,
			},
		],
		xTicks: {
			ticks: [
				...(frame.compact ? [1995, 2005, 2015] : [1995, 2000, 2005, 2010, 2015, 2020, 2025]).map(
					(year) => ({
						label: String(year),
						pos: x(year),
					}),
				),
				{ label: "Not yet", pos: x(NOT_YET), strong: true },
			],
			y: baseline,
		},
		title: "Year GDP per capita first regained its 1990 level",
	};
};

/** Chapter II: peak annual inflation in the 1990s, log scale. */
const prices = (frame: Frame): Scene => {
	const box = inset(frame, { ...rowMargin(frame), right: frame.compact ? 28 : 34 });
	const order = Object.keys(inflationPeak).sort(
		(a, b) => (inflationPeak[b]?.value ?? 0) - (inflationPeak[a]?.value ?? 0),
	);
	const rows = rowsFor(frame, order, box);
	const x = logScale([10, 10000], [box.left, box.right]);
	const marks = hideAll();
	for (const iso of order) {
		const peak = inflationPeak[iso];
		if (peak) marks[iso] = { hollow: peak.lowerBound, r: rows.r, x: x(peak.value), y: rows.y(iso) };
	}
	const focus = ["UKR", "RUS", "POL", "HUN"];
	return {
		callouts: focus.map((iso) => ({
			iso,
			text: `${grouped.format(inflationPeak[iso]?.value ?? 0)}% (${inflationPeak[iso]?.year})`,
		})),
		marks: withFocus(marks, focus),
		rows: rows.rows,
		xTicks: {
			ticks: [10, 100, 1000, 10000].map((value) => ({
				label: `${grouped.format(value)}%`,
				pos: x(value),
			})),
			y: box.bottom,
		},
		title:
			"Peak annual inflation, 1990–99, log scale. Open circles: data start after prices were freed",
	};
};

/** Chapter III: life expectancy, each mark at its lowest point by 2000. */
const lifespan = (frame: Frame): Scene => {
	const box = inset(frame, { bottom: 30, left: 34, right: 18, top: 12 });
	const x = linear([1990, 2005], [box.left, box.right]);
	const y = linear([50, 80], [box.bottom, box.top]);
	const marks = hideAll();
	for (const iso of isos) {
		const series = life[iso] ?? [];
		let low = Number.POSITIVE_INFINITY;
		let lowYear = 1990;
		series.forEach((value, index) => {
			if (value != null && yearOf(index) <= 2000 && value < low) {
				low = value;
				lowYear = yearOf(index);
			}
		});
		marks[iso] = { r: frame.base * 0.66, x: x(lowYear), y: y(low) };
	}
	const focus = ["RUS", "CZE", "BIH", "TJK"];
	return {
		callouts: [
			{ iso: "RUS", text: "Russia, 64.5 in 1994" },
			{ iso: "CZE", text: "Czechia" },
			{ iso: "BIH", text: "Bosnia and Herz., war" },
			{ iso: "TJK", text: "Tajikistan, civil war" },
		],
		lines: isos.map((iso) => ({
			d: pathOf(life[iso] ?? [], x, y, [1990, 2005]),
			iso,
			strong: focus.includes(iso),
		})),
		marks: withFocus(marks, focus),
		title: "Life expectancy at birth, years. Each circle at its lowest point by 2000",
		xTicks: {
			ticks: [1990, 1995, 2000, 2005].map((year) => ({ label: String(year), pos: x(year) })),
			y: box.bottom,
		},
		yTicks: {
			ticks: [50, 55, 60, 65, 70, 75, 80].map((value) => ({ label: String(value), pos: y(value) })),
			x: box.left,
		},
	};
};

/** Change in life expectancy from 1990 to 1995, ranked. */
const mortality = (frame: Frame): Scene => {
	const box = inset(frame, rowMargin(frame));
	const order = [...isos].sort((a, b) => (lifeChange[a] ?? 0) - (lifeChange[b] ?? 0));
	const rows = rowsFor(frame, order, box);
	const x = linear([-5, 3], [box.left, box.right]);
	const marks = hideAll();
	for (const iso of order) marks[iso] = { r: rows.r, x: x(lifeChange[iso] ?? 0), y: rows.y(iso) };
	const focus = ["RUS", "UKR", "LVA", "CZE"];
	return {
		callouts: focus.map((iso) => ({ iso, text: signed(lifeChange[iso] ?? 0, 1, " yrs") })),
		marks: withFocus(marks, focus),
		rows: rows.rows,
		rules: [{ x1: x(0), x2: x(0), y1: box.top, y2: box.bottom }],
		xTicks: {
			ticks: [-4, -2, 0, 2].map((value) => ({
				label: value === 0 ? "0" : signed(value),
				pos: x(value),
				strong: value === 0,
			})),
			y: box.bottom,
		},
		title: "Change in life expectancy, 1990–95 (years)",
	};
};

/** Chapter IV and the epilogue: democracy against income in one year. */
const roads =
	(year: number, focus: string[]) =>
	(frame: Frame): Scene => {
		const box = inset(frame, { bottom: 34, left: 44, right: 18, top: 12 });
		const x = linear([0, 1], [box.left, box.right]);
		const y = logScale([1000, 60000], [box.bottom, box.top]);
		const members = euMembers(year);
		const marks = hideAll();
		for (const iso of isos) {
			const score = at(democracy[iso], year);
			const income = at(gdppc[iso], year);
			if (score == null || income == null) continue;
			marks[iso] = { r: frame.base, ring: members.has(iso), x: x(score), y: y(income) };
		}
		return {
			callouts: focus.map((iso) => ({ iso, text: nameFor(iso) })),
			marks,
			notes: [{ anchor: "end", text: String(year), x: box.right - 4, y: box.bottom - 12 }],
			xTicks: {
				ticks: [0, 0.2, 0.4, 0.6, 0.8, 1].map((value) => ({
					label: value === 0 || value === 1 ? String(value) : value.toFixed(1),
					pos: x(value),
				})),
				y: box.bottom,
			},
			title: `Liberal democracy (V-Dem, 0–1) against GDP per capita, ${year}${members.size ? ". Ringed: EU members" : ""}`,
			yTicks: {
				ticks: [1000, 2000, 5000, 10000, 20000, 50000].map((value) => ({
					label: `$${grouped.format(value / 1000)}k`,
					pos: y(value),
				})),
				x: box.left,
			},
		};
	};

/** Chapter V: income relative to the G7, 1995 (open) to 2025 (filled). */
const catchup = (frame: Frame): Scene => {
	const box = inset(frame, rowMargin(frame));
	const order = [...isos].sort(
		(a, b) => (lastValue(gapG7[b])?.value ?? 0) - (lastValue(gapG7[a])?.value ?? 0),
	);
	const rows = rowsFor(frame, order, box);
	const x = linear([0, 100], [box.left, box.right]);
	const marks = hideAll();
	const ghosts: NonNullable<Scene["ghosts"]> = [];
	const links: NonNullable<Scene["links"]> = [];
	for (const iso of order) {
		const now = lastValue(gapG7[iso])?.value;
		const then = at(gapG7[iso], 1995);
		if (now == null) continue;
		const y = rows.y(iso);
		marks[iso] = { r: rows.r, x: x(now), y };
		if (then != null) {
			ghosts.push({ iso, r: rows.r * 0.8, x: x(then), y });
			links.push({ iso, x1: x(then), x2: x(now), y1: y, y2: y });
		}
	}
	const focus = ["LTU", "POL", "UKR"];
	return {
		callouts: focus.map((iso) => ({
			iso,
			text: `${Math.round(at(gapG7[iso], 1995) ?? 0)}% → ${Math.round(lastValue(gapG7[iso])?.value ?? 0)}%`,
		})),
		ghosts,
		links,
		marks: withFocus(marks, focus),
		rows: rows.rows,
		xTicks: {
			ticks: [0, 25, 50, 75, 100].map((value) => ({
				label: `${value}%`,
				pos: x(value),
				strong: value === 100,
			})),
			y: box.bottom,
		},
		title: `GDP per capita as a share of the G7: open circles 1995, filled ${LAST_YEAR}`,
	};
};

/** Chapter VI: population change since 1990, ranked. */
const leaving = (frame: Frame): Scene => {
	const box = inset(frame, rowMargin(frame));
	const order = [...isos].sort((a, b) => (popChange[a] ?? 0) - (popChange[b] ?? 0));
	const rows = rowsFor(frame, order, box);
	const x = linear([-40, 110], [box.left, box.right]);
	const marks = hideAll();
	for (const iso of order) marks[iso] = { r: rows.r, x: x(popChange[iso] ?? 0), y: rows.y(iso) };
	const focus = ["LVA", "UKR", "TJK", "TKM"];
	return {
		callouts: focus.map((iso) => ({ iso, text: signed(popChange[iso] ?? 0, 0, "%") })),
		marks: withFocus(marks, focus),
		rows: rows.rows,
		rules: [{ x1: x(0), x2: x(0), y1: box.top, y2: box.bottom }],
		xTicks: {
			ticks: [-30, 0, 30, 60, 90].map((value) => ({
				label: value === 0 ? "0" : signed(value, 0, "%"),
				pos: x(value),
				strong: value === 0,
			})),
			y: box.bottom,
		},
		title: `Change in population, 1990–${POPULATION_YEAR}`,
	};
};

/** Chapter VII: liberal democracy over time, marks at the latest year. */
const reversals = (frame: Frame): Scene => {
	const box = inset(frame, { bottom: 30, left: 34, right: frame.compact ? 18 : 24, top: 12 });
	const x = linear([1990, LAST_YEAR], [box.left, box.right]);
	const y = linear([0, 1], [box.bottom, box.top]);
	const marks = hideAll();
	for (const iso of isos) {
		const last = lastValue(democracy[iso]);
		if (last) marks[iso] = { r: frame.base * 0.6, x: x(yearOf(last.index)), y: y(last.value) };
	}
	const focus = ["HUN", "POL", "RUS"];
	return {
		callouts: focus.map((iso) => ({
			iso,
			text: `${nameFor(iso)} ${(lastValue(democracy[iso])?.value ?? 0).toFixed(2)}`,
		})),
		lines: isos.map((iso) => ({
			d: pathOf(democracy[iso] ?? [], x, y, [1990, LAST_YEAR]),
			iso,
			strong: focus.includes(iso),
		})),
		marks: withFocus(marks, focus),
		title: "Liberal democracy index (V-Dem), 0 to 1",
		xTicks: {
			ticks: [1990, 2000, 2010, 2020].map((year) => ({ label: String(year), pos: x(year) })),
			y: box.bottom,
		},
		yTicks: {
			ticks: [0, 0.2, 0.4, 0.6, 0.8, 1].map((value) => ({
				label: value === 0 || value === 1 ? String(value) : value.toFixed(1),
				pos: y(value),
			})),
			x: box.left,
		},
	};
};

/** Ukraine against the rest: GDP per capita relative to 1990, log scale. */
const war = (frame: Frame): Scene => {
	const box = inset(frame, { bottom: 30, left: 40, right: frame.compact ? 18 : 24, top: 12 });
	const x = linear([1990, LAST_YEAR], [box.left, box.right]);
	const y = logScale([20, 500], [box.bottom, box.top]);
	const marks = hideAll();
	for (const iso of comparable) {
		const last = lastValue(gdpIndex[iso]);
		if (last) marks[iso] = { r: frame.base * 0.6, x: x(yearOf(last.index)), y: y(last.value) };
	}
	return {
		callouts: [
			{
				iso: "UKR",
				side: "above",
				text: `Ukraine ${Math.round(lastValue(gdpIndex.UKR)?.value ?? 0)}`,
			},
		],
		lines: comparable.map((iso) => ({
			d: pathOf(gdpIndex[iso] ?? [], x, y, [1990, LAST_YEAR]),
			iso,
			strong: iso === "UKR",
		})),
		marks: withFocus(marks, ["UKR"]),
		rules: [{ label: "1990 = 100", x1: box.left, x2: box.right, y1: y(100), y2: y(100) }],
		title: "GDP per capita at PPP, 1990 = 100, log scale",
		xTicks: {
			ticks: [1990, 2000, 2010, 2020].map((year) => ({ label: String(year), pos: x(year) })),
			y: box.bottom,
		},
		yTicks: {
			ticks: [25, 50, 100, 200, 400].map((value) => ({
				label: String(value),
				pos: y(value),
				strong: value === 100,
			})),
			x: box.left,
		},
	};
};

export const scenes: Record<SceneId, (frame: Frame) => Scene> = {
	catchup,
	depth,
	fall,
	geo,
	leaving,
	lifespan,
	mortality,
	now: roads(LAST_YEAR, ["EST", "CZE", "HUN", "RUS", "TJK"]),
	people,
	prices,
	recovery,
	reversals,
	"roads-1995": roads(1995, ["CZE", "POL", "RUS", "TKM"]),
	"roads-2007": roads(2007, ["POL", "RUS", "UKR", "BLR"]),
	tiles,
	war,
};

export const isSceneId = (value: string): value is SceneId => value in scenes;

/* ---------- figures quoted in the copy ---------- */

const median = (values: number[]) => {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2
		? (sorted[middle] ?? 0)
		: ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

/** Numbers the story text quotes, computed from the same snapshot as the charts. */
export const facts = {
	comparableCount: comparable.length,
	lastYear: LAST_YEAR,
	medianIndex1995: Math.round(
		median(comparable.map((iso) => at(gdpIndex[iso], 1995)).filter((v): v is number => v != null)),
	),
	population1990: isos.reduce((sum, iso) => sum + (population[iso]?.[0] ?? 0), 0),
	ukraineIndex: Math.round(lastValue(gdpIndex.UKR)?.value ?? 0),
};
