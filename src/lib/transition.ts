/**
 * Figure 1 view model: measures, scales, paths, bins and readouts for the
 * transition-economies chart and tile map. Pure functions, shared by the
 * server render (first paint, no JS) and the client script (interaction).
 */
import raw from "@/data/generated/transition.json";
import {
	regionNames,
	type TransitionCountry,
	transitionCountries,
} from "@/data/transition-countries";

/** Advanced-economy benchmarks for convergence: the frontier the economies are measured against. */
export type BenchmarkId = "eu15" | "g7" | "usa";
/** "gap": income as a share of the benchmark over time. "catchup": growth against the benchmark. */
export type ConvergenceForm = "catchup" | "gap";
export type MeasureId =
	| "democracy"
	| "distribution"
	| "gdppc"
	| "index"
	| "lifeexp"
	| `${ConvergenceForm}-${BenchmarkId}`;
/** The tabs above the figure; the Convergence tab covers six measures (form × benchmark). */
export type TabId = "convergence" | "democracy" | "distribution" | "gdppc" | "index" | "lifeexp";
/**
 * "series": values over time. "distribution": economies across one year's values.
 * "convergence": relative income in a start year against growth relative to the benchmark since.
 */
export type MeasureKind = "convergence" | "distribution" | "series";
export type Ramp = "div" | "grow" | "seq";
/** Where a measure's data comes from: the World Bank's WDI, or V-Dem. */
type SourceId = "vdem" | "wdi";
type ScaleKind = "linear" | "log" | "symlog";
type Series = readonly (number | null)[];

export interface Measure {
	baseline?: number;
	benchmark?: BenchmarkId;
	binLabels: string[];
	domain: [number, number];
	form?: ConvergenceForm;
	format: (value: number) => string;
	id: MeasureId;
	kind: MeasureKind;
	note: string;
	/** Decimals shown in readouts; map bins use the rounded value so a "0.65" never sits below 0.65. */
	precision?: number;
	ramp: Ramp;
	scale: ScaleKind;
	source: SourceId;
	tab: string;
	tabId: TabId;
	thresholds: readonly number[];
	tickLabel: (value: number) => string;
	ticks: number[];
	title: string;
	/** Trailing unit in `format` output, which narrow legends drop because the axis gives it. */
	unit?: string;
}

const MIN_MEDIAN_COUNT = 15;
/** Convergence needs at least this many years of growth after the start year. */
const CONVERGENCE_MIN_YEARS = 10;
const MINUS = "−";

export const DEFAULT_MEASURE: MeasureId = "gdppc";
export const DEFAULT_PINNED = ["POL", "UKR", "RUS"] as const;
export const MAX_PINNED = 3;

export const years: readonly number[] = raw.years;
export const firstYear = years[0] ?? 1990;
export const lastYear = years.at(-1) ?? 2024;
export const maxStartIndex = years.length - 1 - CONVERGENCE_MIN_YEARS;
export const DEFAULT_CONVERGENCE_START = 1995;
export const DEFAULT_BENCHMARK: BenchmarkId = "g7";
export const DEFAULT_FORM: ConvergenceForm = "gap";
export const countries = transitionCountries;
export const countryByIso = new Map(countries.map((country) => [country.iso3, country]));
export { regionNames };

const rawValues = raw.values as unknown as Record<string, Record<string, Series>>;
/** Measures whose data is stored under a different key in the snapshot. */
const dataKey: Partial<Record<MeasureId, string>> = { democracy: "libdem" };

/* ---------- sources ---------- */

interface Source {
	lastUpdated: string;
	name: string;
	url: string;
}

const sources: Record<SourceId, Source> = { vdem: raw.sources.vdem, wdi: raw.source };
const dayFormat = new Intl.DateTimeFormat("en-GB", {
	day: "numeric",
	month: "short",
	timeZone: "UTC",
	year: "numeric",
});

export const sourceFor = (measure: Pick<Measure, "source">) => sources[measure.source];
/** "World Bank, World Development Indicators, updated 8 Oct 2026" */
export const sourceLine = (measure: Pick<Measure, "source">) => {
	const { lastUpdated, name } = sourceFor(measure);
	return `${name}, updated ${dayFormat.format(new Date(lastUpdated))}`;
};

const alignedSeries = (key: string): Record<string, Series> => {
	const table = rawValues[key] ?? {};
	return Object.fromEntries(
		countries.map((country) => [country.iso3, table[country.iso3] ?? years.map(() => null)]),
	);
};

const indexSeries = (): Record<string, Series> => {
	const levels = alignedSeries("gdppc");
	return Object.fromEntries(
		Object.entries(levels).map(([iso3, series]) => {
			const base = series[0];
			return [iso3, series.map((value) => (base && value != null ? (100 * value) / base : null))];
		}),
	);
};

/* ---------- benchmarks ---------- */

interface BenchmarkData {
	members: string[];
	name: string;
	values: (number | null)[];
}

const rawBenchmarks = raw.benchmarks as unknown as Record<BenchmarkId, BenchmarkData>;

export const benchmarkOrder: readonly BenchmarkId[] = ["g7", "usa", "eu15"];
export const benchmarkLabel: Record<BenchmarkId, string> = {
	eu15: "EU-15",
	g7: "G7",
	usa: "United States",
};
/** How each benchmark reads inside a sentence. */
const benchmarkPhrase: Record<BenchmarkId, string> = {
	eu15: "the EU-15",
	g7: "the G7",
	usa: "the United States",
};
const benchmarkDefinition: Record<BenchmarkId, string> = {
	eu15: "the population-weighted average of the 15 countries in the EU before 2004",
	g7: "the population-weighted average of the G7",
	usa: "the United States",
};
const benchmarkValues = (benchmark: BenchmarkId): Series =>
	rawBenchmarks[benchmark]?.values ?? years.map(() => null);

export const convergenceMeasureId = (form: ConvergenceForm, benchmark: BenchmarkId): MeasureId =>
	`${form}-${benchmark}`;

/** Compound annual growth from `start` to `end` over `span` years, percent. */
const cagr = (start: number, end: number, span: number) => 100 * ((end / start) ** (1 / span) - 1);

/** GDP per capita as a percentage of the benchmark in the same year. */
const gapSeries = (benchmark: BenchmarkId): Record<string, Series> => {
	const frontier = benchmarkValues(benchmark);
	return Object.fromEntries(
		Object.entries(alignedSeries("gdppc")).map(([iso3, series]) => [
			iso3,
			series.map((value, index) => {
				const reference = frontier[index];
				return value != null && reference ? (100 * value) / reference : null;
			}),
		]),
	);
};

/**
 * Catch-up: average annual growth from each start year to the latest year, minus the
 * benchmark's growth over the same years, in percentage points. Positive means closing the gap.
 */
const catchUpSeries = (benchmark: BenchmarkId): Record<string, Series> => {
	const frontier = benchmarkValues(benchmark);
	const last = years.length - 1;
	const frontierEnd = frontier[last];
	return Object.fromEntries(
		Object.entries(alignedSeries("gdppc")).map(([iso3, series]) => {
			const end = series[last];
			return [
				iso3,
				series.map((start, index) => {
					const frontierStart = frontier[index];
					if (start == null || end == null || !frontierStart || !frontierEnd) return null;
					if (index > maxStartIndex) return null;
					const span = last - index;
					return cagr(start, end, span) - cagr(frontierStart, frontierEnd, span);
				}),
			];
		}),
	);
};

const seriesCache = new Map<MeasureId, Record<string, Series>>();

export const seriesFor = (measure: MeasureId): Record<string, Series> => {
	let cached = seriesCache.get(measure);
	if (!cached) {
		const [form, benchmark] = measure.split("-") as [string, BenchmarkId | undefined];
		cached =
			measure === "index"
				? indexSeries()
				: measure === "distribution"
					? seriesFor("gdppc")
					: form === "gap" && benchmark
						? gapSeries(benchmark)
						: form === "catchup" && benchmark
							? catchUpSeries(benchmark)
							: alignedSeries(dataKey[measure] ?? measure);
		seriesCache.set(measure, cached);
	}
	return cached;
};

/* ---------- number formatting ---------- */

const grouped = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
/** Percentage points with an explicit sign: "+2.4 pts", "−0.8 pts". */
const points = (value: number, digits = 1) => {
	// Round first so a tiny negative never prints as "−0.0".
	const rounded = Number(value.toFixed(digits));
	return `${rounded > 0 ? "+" : rounded < 0 ? MINUS : ""}${Math.abs(rounded).toFixed(digits)} pts`;
};
const compactDollars = (value: number) =>
	value >= 1000 ? `$${grouped.format(value / 1000)}k` : `$${grouped.format(value)}`;

/* ---------- scales ---------- */

const transform = (kind: ScaleKind, value: number) => {
	if (kind === "log") return Math.log10(Math.max(value, 1e-9));
	if (kind === "symlog") return Math.sign(value) * Math.log10(1 + Math.abs(value));
	return value;
};

const extent = (measure: MeasureId) => {
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	for (const series of Object.values(seriesFor(measure))) {
		for (const value of series) {
			if (value == null) continue;
			if (value < min) min = value;
			if (value > max) max = value;
		}
	}
	return Number.isFinite(min) ? [min, max] : [0, 1];
};

const fromCandidates = (candidates: number[], [min, max]: number[]) => {
	const low = [...candidates].reverse().find((value) => value <= (min ?? 0)) ?? candidates[0] ?? 0;
	const high = candidates.find((value) => value >= (max ?? 1)) ?? candidates.at(-1) ?? 1;
	return {
		domain: [low, high] as [number, number],
		ticks: candidates.filter((value) => value >= low && value <= high),
	};
};

const niceLinear = ([min, max]: number[], targetTicks = 5) => {
	const low = min ?? 0;
	const high = max ?? 1;
	const raw = (high - low) / targetTicks;
	const power = 10 ** Math.floor(Math.log10(raw));
	const step = ([1, 2, 2.5, 5, 10].find((factor) => factor * power >= raw) ?? 10) * power;
	const start = Math.floor(low / step) * step;
	const end = Math.ceil(high / step) * step;
	const ticks: number[] = [];
	for (let value = start; value <= end + step / 2; value += step)
		ticks.push(Math.round(value * 1e6) / 1e6);
	return { domain: [start, end] as [number, number], ticks };
};

const binLabelsFor = (thresholds: readonly number[], format: (value: number) => string) => [
	`Below ${format(thresholds[0] ?? 0)}`,
	...thresholds
		.slice(0, -1)
		.map((value, index) => `${format(value)} to ${format(thresholds[index + 1] ?? 0)}`),
	`${format(thresholds.at(-1) ?? 0)} and above`,
];

const buildMeasure = (
	spec: Omit<Measure, "binLabels" | "domain" | "kind" | "source" | "tabId" | "ticks"> & {
		binFormat?: (value: number) => string;
		binLabels?: string[];
		kind?: MeasureKind;
		layout: () => { domain: [number, number]; ticks: number[] };
		source?: SourceId;
		tabId?: TabId;
	},
): Measure => {
	const { binFormat, binLabels, kind = "series", layout, source = "wdi", tabId, ...rest } = spec;
	return {
		...rest,
		...layout(),
		binLabels: binLabels ?? binLabelsFor(spec.thresholds, binFormat ?? spec.tickLabel),
		kind,
		source,
		tabId: tabId ?? (spec.id as TabId),
	};
};

const gapMeasure = (benchmark: BenchmarkId) => {
	const id = convergenceMeasureId("gap", benchmark);
	return buildMeasure({
		baseline: 100,
		benchmark,
		form: "gap",
		format: (value) => `${grouped.format(value)}% of ${benchmarkLabel[benchmark]}`,
		id,
		// Always reach 100% so the frontier itself is on the chart.
		layout: () => niceLinear([0, Math.max(100, extent(id)[1] ?? 100)], 5),
		note: `GDP per capita at purchasing power parity as a percentage of ${benchmarkDefinition[benchmark]} in the same year. The 100% line is the benchmark; rising lines mean an economy is closing the gap.`,
		ramp: "seq",
		scale: "linear",
		tab: "Convergence",
		tabId: "convergence",
		thresholds: [20, 30, 40, 50, 60, 75],
		tickLabel: (value) => `${grouped.format(value)}%`,
		title: `GDP per capita relative to ${benchmarkPhrase[benchmark]}`,
		unit: ` of ${benchmarkLabel[benchmark]}`,
	});
};

const catchUpMeasure = (benchmark: BenchmarkId) => {
	const id = convergenceMeasureId("catchup", benchmark);
	return buildMeasure({
		baseline: 0,
		benchmark,
		binLabels: [
			"Falling behind",
			"Up to 1 pt a year faster",
			"1 to 2 pts faster",
			"2 to 3 pts faster",
			"3 to 4 pts faster",
			"4 to 5 pts faster",
			"5 pts or more faster",
		],
		form: "catchup",
		format: (value) => `${points(value)} a year`,
		id,
		kind: "convergence",
		layout: () => niceLinear([Math.min(0, extent(id)[0] ?? 0), Math.max(0, extent(id)[1] ?? 1)], 5),
		note: `Each dot is one economy: GDP per capita in the start year as a percentage of ${benchmarkDefinition[benchmark]} (log scale), against average annual growth in GDP per capita since then minus the benchmark's growth over the same years. Dots above zero closed part of the gap. The line is a least-squares fit on log relative income; a downward slope means economies further behind caught up faster.`,
		ramp: "grow",
		scale: "linear",
		tab: "Convergence",
		tabId: "convergence",
		thresholds: [0, 1, 2, 3, 4, 5],
		tickLabel: (value) => (value === 0 ? "0" : points(value, 0)),
		title: `Growth relative to ${benchmarkPhrase[benchmark]}`,
		unit: " a year",
	});
};

const incomeLayout = () =>
	fromCandidates([500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000], extent("gdppc"));

export const measures = {
	gdppc: buildMeasure({
		format: (value) => `$${grouped.format(value)}`,
		id: "gdppc",
		layout: incomeLayout,
		note: "Constant 2021 international dollars at purchasing power parity, log scale.",
		ramp: "seq",
		scale: "log",
		tab: "Income",
		thresholds: [5000, 10000, 15000, 20000, 30000, 40000],
		tickLabel: compactDollars,
		title: "GDP per capita",
	}),
	distribution: buildMeasure({
		format: (value) => `$${grouped.format(value)}`,
		id: "distribution",
		kind: "distribution",
		// Room past the richest economy so the density can taper instead of ending in a cliff.
		layout: () => ({
			domain: [1000, 80000],
			ticks: [1000, 2000, 5000, 10000, 20000, 50000],
		}),
		note: "Each dot is one economy, placed by GDP per capita in constant 2021 international dollars at purchasing power parity (log scale). The shaded curve smooths the dots into a density; the outline is the 1990 distribution.",
		ramp: "seq",
		scale: "log",
		tab: "Distribution",
		thresholds: [5000, 10000, 15000, 20000, 30000, 40000],
		tickLabel: compactDollars,
		title: "GDP per capita",
	}),
	index: buildMeasure({
		baseline: 100,
		binFormat: (value) => grouped.format(value),
		format: (value) => grouped.format(value),
		id: "index",
		layout: () => fromCandidates([10, 20, 25, 50, 100, 200, 400, 800], extent("index")),
		note: "GDP per capita as an index, 1990 = 100, log scale. Economies without 1990 data are left out.",
		ramp: "div",
		scale: "log",
		tab: "Since 1990",
		thresholds: [50, 75, 95, 105, 150, 200],
		tickLabel: (value) => grouped.format(value),
		title: "GDP per capita relative to 1990",
	}),
	lifeexp: buildMeasure({
		binFormat: (value) => grouped.format(value),
		format: (value) => `${value.toFixed(1)} years`,
		id: "lifeexp",
		layout: () => niceLinear(extent("lifeexp"), 7),
		note: "Life expectancy at birth in years, both sexes: how long a newborn would live if that year's death rates held for life. It tracks mortality year by year, so crises, wars and COVID-19 show up as dips.",
		precision: 1,
		ramp: "seq",
		scale: "linear",
		tab: "Life expectancy",
		thresholds: [65, 68, 71, 74, 77, 80],
		tickLabel: (value) => grouped.format(value),
		title: "Life expectancy at birth",
		unit: " years",
	}),
	democracy: buildMeasure({
		binFormat: (value) => value.toFixed(2),
		format: (value) => value.toFixed(2),
		id: "democracy",
		layout: () => ({ domain: [0, 1], ticks: [0, 0.2, 0.4, 0.6, 0.8, 1] }),
		note: "V-Dem's liberal democracy index, from 0 to 1: free and fair elections, freedom of association and expression, civil liberties, equality before the law and limits on the executive. Estimated from country experts' ratings; higher is more democratic.",
		precision: 2,
		ramp: "seq",
		scale: "linear",
		source: "vdem",
		tab: "Democracy",
		thresholds: [0.1, 0.2, 0.35, 0.5, 0.65, 0.8],
		tickLabel: (value) => value.toFixed(1),
		title: "Liberal democracy index",
	}),
	...Object.fromEntries(
		benchmarkOrder.flatMap((benchmark) => [
			[convergenceMeasureId("gap", benchmark), gapMeasure(benchmark)],
			[convergenceMeasureId("catchup", benchmark), catchUpMeasure(benchmark)],
		]),
	),
} as Record<MeasureId, Measure>;

export const isMeasureId = (value: string): value is MeasureId => value in measures;

export const tabOrder: readonly TabId[] = [
	"gdppc",
	"distribution",
	"index",
	"convergence",
	"lifeexp",
	"democracy",
];

export const tabLabel: Record<TabId, string> = {
	convergence: "Convergence",
	democracy: "Democracy",
	distribution: "Distribution",
	gdppc: "Income",
	index: "Since 1990",
	lifeexp: "Life expectancy",
};

/** The concrete measure behind a tab, given the convergence choices. */
export const measureForTab = (
	tab: TabId,
	form: ConvergenceForm,
	benchmark: BenchmarkId,
): MeasureId => (tab === "convergence" ? convergenceMeasureId(form, benchmark) : tab);

/** Vertical position, 0 at the bottom of the plot and 1 at the top. */
export const position = (measure: Pick<Measure, "domain" | "scale">, value: number) => {
	const [d0, d1] = measure.domain;
	const low = transform(measure.scale, d0);
	const high = transform(measure.scale, d1);
	const t = (transform(measure.scale, value) - low) / (high - low || 1);
	return Math.min(1, Math.max(0, t));
};

/**
 * Spreads end labels so neighbours sit at least `gap` apart (positions as above, 0..1).
 * Crowded labels are centred as a group on their lines and kept inside the plot.
 */
export const spreadLabels = (positions: number[], gap: number) => {
	type Group = { centre: number; items: { index: number; pos: number }[] };
	const start = ({ centre, items }: Group) => {
		const span = (items.length - 1) * gap;
		return Math.min(Math.max(centre - span / 2, 0), Math.max(0, 1 - span));
	};
	const groups: Group[] = positions
		.map((pos, index) => ({ index, pos }))
		.sort((a, b) => a.pos - b.pos)
		.map((item) => ({ centre: item.pos, items: [item] }));
	for (let i = 1; i < groups.length; i++) {
		const below = groups[i - 1];
		const above = groups[i];
		if (!below || !above) break;
		if (start(above) - start(below) - (below.items.length - 1) * gap >= gap) continue;
		const items = [...below.items, ...above.items];
		groups.splice(i - 1, 2, {
			centre: items.reduce((sum, item) => sum + item.pos, 0) / items.length,
			items,
		});
		i = 0;
	}
	const spread = [...positions];
	for (const group of groups) {
		group.items.forEach((item, k) => {
			spread[item.index] = start(group) + k * gap;
		});
	}
	return spread;
};

/** A readout split into its number and trailing unit ("73%" and " of G7"). */
export const formatParts = (measure: Pick<Measure, "format" | "unit">, value: number) => {
	const text = measure.format(value);
	const unit = measure.unit && text.endsWith(measure.unit) ? measure.unit : "";
	return { number: unit ? text.slice(0, -unit.length) : text, unit };
};

/** Horizontal position of a year index, 0..1. */
export const xPosition = (yearIndex: number) => yearIndex / Math.max(1, years.length - 1);

/* ---------- paths (SVG viewBox 0 0 1000 1000, stretched with non-scaling strokes) ---------- */

export const VIEWBOX = 1000;

export const pathFor = (measure: Measure, series: Series, upTo = years.length - 1) => {
	let d = "";
	let pen = false;
	for (let index = 0; index <= upTo; index += 1) {
		const value = series[index];
		if (value == null) {
			pen = false;
			continue;
		}
		const x = (xPosition(index) * VIEWBOX).toFixed(1);
		const y = ((1 - position(measure, value)) * VIEWBOX).toFixed(1);
		d += `${pen ? "L" : "M"}${x} ${y}`;
		pen = true;
	}
	return d;
};

const medianOf = (values: number[]) => {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2
		? (sorted[middle] ?? null)
		: ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

const medianCache = new Map<MeasureId, Series>();

export const medianSeries = (measureId: MeasureId): Series => {
	let cached = medianCache.get(measureId);
	if (!cached) {
		const all = Object.values(seriesFor(measureId));
		cached = years.map((_, index) => {
			const values = all
				.map((series) => series[index])
				.filter((value): value is number => value != null);
			return values.length >= MIN_MEDIAN_COUNT ? medianOf(values) : null;
		});
		medianCache.set(measureId, cached);
	}
	return cached;
};

export const valueAt = (measureId: MeasureId, iso3: string, yearIndex: number) =>
	seriesFor(measureId)[iso3]?.[yearIndex] ?? null;

/**
 * Last year the slider can reach: the latest year with data for enough economies to draw a
 * median (life expectancy ends a year before GDP), or for convergence the latest start year.
 */
export const maxYearIndex = (measure: Pick<Measure, "id" | "kind">) => {
	if (measure.kind === "convergence") return maxStartIndex;
	const all = Object.values(seriesFor(measure.id));
	for (let index = years.length - 1; index > 0; index -= 1) {
		if (all.filter((series) => series[index] != null).length >= MIN_MEDIAN_COUNT) return index;
	}
	return years.length - 1;
};

/** Last year index at or before `yearIndex` that has a value (for end labels). */
export const lastIndexWithValue = (series: Series, yearIndex = years.length - 1) => {
	for (let index = yearIndex; index >= 0; index -= 1) if (series[index] != null) return index;
	return -1;
};

/* ---------- bins for the tile map ---------- */

export const binFor = (measure: Measure, value: number | null): string => {
	if (value == null) return "na";
	const shown = measure.precision == null ? value : Number(value.toFixed(measure.precision));
	const index = measure.thresholds.findIndex((threshold) => shown < threshold);
	return String(index === -1 ? measure.thresholds.length : index);
};

/** Characters in the widest y-axis label, used to size the axis column. */
export const tickLabelChars = (measure: Measure) =>
	Math.max(...measure.ticks.map((value) => measure.tickLabel(value).length), 3);

type Axis = Pick<Measure, "baseline" | "domain" | "scale" | "tickLabel" | "ticks">;

export const tickPositions = (measure: Axis) =>
	measure.ticks.map((value) => ({
		label: measure.tickLabel(value),
		pos: position(measure, value),
		strong: value === measure.baseline,
		value,
	}));

/** Every fifth year; `major` ticks (decades) are the ones kept on narrow screens. */
export const xTicks = () =>
	years
		.map((year, index) => ({ index, year }))
		.filter(({ year }) => year % 5 === 0)
		.map(({ index, year }) => ({
			label: String(year),
			major: year % 10 === 0,
			pos: xPosition(index),
			year,
		}));

export const figureTitle = (measure: Measure, yearIndex = years.length - 1) => {
	if (measure.kind === "distribution") {
		return `How GDP per capita is distributed across ${countries.length} post-communist economies`;
	}
	if (measure.kind === "convergence" && measure.benchmark) {
		return `Catching up with ${benchmarkPhrase[measure.benchmark]}: income in ${years[yearIndex]} and growth to ${lastYear} in ${countries.length} post-communist economies`;
	}
	return `${measure.title} in ${countries.length} post-communist economies, ${firstYear}–${years[maxYearIndex(measure)]}`;
};

/* ---------- catch-up: relative income in a start year against relative growth since ---------- */

/** Horizontal axis of the catch-up view: income as a percentage of the benchmark, log scale. */
export const relativeIncomeAxis = (benchmark: BenchmarkId): Axis => {
	const id = convergenceMeasureId("gap", benchmark);
	const starts = Object.values(seriesFor(id)).flatMap((series) =>
		series.slice(0, maxStartIndex + 1).filter((value): value is number => value != null),
	);
	const layout = fromCandidates(
		[1, 2, 5, 10, 20, 50, 100, 200],
		[Math.min(...starts), Math.max(100, ...starts)],
	);
	return {
		baseline: 100,
		...layout,
		scale: "log",
		tickLabel: (value) => `${grouped.format(value)}%`,
	};
};

export interface ConvergencePoint {
	/** Growth minus the benchmark's growth since the start year, percentage points a year. */
	growth: number;
	iso3: string;
	/** Income in the start year, percent of the benchmark. */
	start: number;
	/** Horizontal position (log relative income), 0..1. */
	x: number;
	/** Vertical position (relative growth), 0..1. */
	y: number;
}

export const convergencePoints = (measure: Measure, startIndex: number): ConvergencePoint[] => {
	const benchmark = measure.benchmark ?? DEFAULT_BENCHMARK;
	const axis = relativeIncomeAxis(benchmark);
	const gapId = convergenceMeasureId("gap", benchmark);
	return countries.flatMap((country) => {
		const start = valueAt(gapId, country.iso3, startIndex);
		const growth = valueAt(measure.id, country.iso3, startIndex);
		if (start == null || growth == null) return [];
		return [
			{
				growth,
				iso3: country.iso3,
				start,
				x: position(axis, start),
				y: position(measure, growth),
			},
		];
	});
};

/** Least-squares fit of relative growth on log relative starting income. */
export const convergenceFit = (measure: Measure, points: readonly ConvergencePoint[]) => {
	const n = points.length;
	if (n < 3) return null;
	const axis = relativeIncomeAxis(measure.benchmark ?? DEFAULT_BENCHMARK);
	const xs = points.map((point) => Math.log(point.start));
	const ys = points.map((point) => point.growth);
	const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
	const meanY = ys.reduce((sum, value) => sum + value, 0) / n;
	let sxy = 0;
	let sxx = 0;
	let syy = 0;
	xs.forEach((x, index) => {
		const dy = (ys[index] ?? 0) - meanY;
		sxy += (x - meanX) * dy;
		sxx += (x - meanX) ** 2;
		syy += dy ** 2;
	});
	const slope = sxy / sxx;
	const intercept = meanY - slope * meanX;
	const low = Math.min(...points.map((point) => point.start));
	const high = Math.max(...points.map((point) => point.start));
	const at = (relative: number) => intercept + slope * Math.log(relative);
	return {
		/** Fitted line in the 0..1000 viewBox, from the furthest-behind to the closest economy. */
		line: {
			x1: position(axis, low) * VIEWBOX,
			x2: position(axis, high) * VIEWBOX,
			y1: (1 - position(measure, at(low))) * VIEWBOX,
			y2: (1 - position(measure, at(high))) * VIEWBOX,
		},
		n,
		/** Percentage points of relative growth per doubling of relative starting income. */
		perDoubling: slope * Math.LN2,
		r2: syy > 0 ? (sxy * sxy) / (sxx * syy) : 0,
	};
};

/** Median income as a percentage of the benchmark across economies with data in a year. */
export const medianRelativeIncome = (benchmark: BenchmarkId, yearIndex: number) =>
	medianSeries(convergenceMeasureId("gap", benchmark))[yearIndex] ?? null;

export { benchmarkPhrase };

/* ---------- distribution: dots and a kernel density per year ---------- */

/** Economies with a value in the given year, in tile-map order. */
export const distributionValues = (measure: Measure, yearIndex: number) =>
	countries.flatMap((country) => {
		const value = valueAt(measure.id, country.iso3, yearIndex);
		return value == null ? [] : [{ iso3: country.iso3, pos: position(measure, value), value }];
	});

/**
 * Gaussian kernel density on the scaled axis (0..1), normalised so each year's
 * curve has unit area. The bandwidth is fixed rather than fitted per year, so
 * curves from different years can be compared directly.
 */
const DENSITY_BANDWIDTH = 0.045;
const DENSITY_SAMPLES = 160;

const densityAt = (measure: Measure, yearIndex: number) => {
	const points = distributionValues(measure, yearIndex).map(({ pos }) => pos);
	const norm = 1 / (points.length * DENSITY_BANDWIDTH * Math.sqrt(2 * Math.PI));
	return Array.from({ length: DENSITY_SAMPLES + 1 }, (_, step) => {
		const x = step / DENSITY_SAMPLES;
		let sum = 0;
		for (const point of points) sum += Math.exp(-0.5 * ((x - point) / DENSITY_BANDWIDTH) ** 2);
		return points.length ? sum * norm : 0;
	});
};

const densityPeak = new Map<MeasureId, number>();

/** Tallest density in any year, so every year shares one vertical scale. */
const peakDensity = (measure: Measure) => {
	let peak = densityPeak.get(measure.id);
	if (peak === undefined) {
		peak = Math.max(...years.map((_, index) => Math.max(...densityAt(measure, index))), 1e-9);
		densityPeak.set(measure.id, peak);
	}
	return peak;
};

/** Density curve in the 0..1000 viewBox; `closed` returns a filled area. */
export const densityPath = (measure: Measure, yearIndex: number, closed: boolean) => {
	const peak = peakDensity(measure);
	const points = densityAt(measure, yearIndex).map(
		(density, step) =>
			`${((step / DENSITY_SAMPLES) * VIEWBOX).toFixed(1)} ${(VIEWBOX - (density / peak) * VIEWBOX * 0.92).toFixed(1)}`,
	);
	return closed
		? `M0 ${VIEWBOX}L${points.join("L")}L${VIEWBOX} ${VIEWBOX}Z`
		: `M${points.join("L")}`;
};

export const tableRows = (measure: Measure, yearIndex: number) =>
	countries
		.map((country: TransitionCountry) => ({
			country,
			value: valueAt(measure.id, country.iso3, yearIndex),
		}))
		.sort((a, b) => {
			if (a.value == null) return 1;
			if (b.value == null) return -1;
			return b.value - a.value;
		});

/** Small inline path for table sparklines, viewBox 0 0 100 24. */
export const sparkPath = (measure: Measure, series: Series) => {
	let d = "";
	let pen = false;
	series.forEach((value, index) => {
		if (value == null) {
			pen = false;
			return;
		}
		const x = (xPosition(index) * 100).toFixed(1);
		const y = (2 + (1 - position(measure, value)) * 20).toFixed(1);
		d += `${pen ? "L" : "M"}${x} ${y}`;
		pen = true;
	});
	return d;
};
