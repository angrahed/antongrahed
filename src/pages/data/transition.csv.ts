import raw from "@/data/generated/transition.json";
import { regionNames, transitionCountries } from "@/data/transition-countries";

/** Figure 1 data in long format, one row per economy and year. */
export const GET = () => {
	const values = raw.values as unknown as Record<string, Record<string, (number | null)[]>>;
	const columns = [
		["gdppc", "gdp_per_capita_ppp_2021usd"],
		["growth", "real_gdp_growth_pct"],
		["inflation", "cpi_inflation_pct"],
		["deflator", "gdp_deflator_inflation_pct"],
		["trade", "trade_pct_gdp"],
		["lifeexp", "life_expectancy_years"],
		["libdem", "vdem_liberal_democracy_index"],
	] as const;
	// Benchmark GDP per capita (population-weighted, PPP) repeats on every row of its year.
	const benchmarks = raw.benchmarks as unknown as Record<string, { values: (number | null)[] }>;
	const benchmarkColumns = [
		["g7", "g7_gdp_per_capita_ppp_2021usd"],
		["usa", "us_gdp_per_capita_ppp_2021usd"],
		["eu15", "eu15_gdp_per_capita_ppp_2021usd"],
	] as const;
	const quote = (text: string) => (/[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text);
	const lines = [
		[
			"iso3",
			"economy",
			"region",
			"year",
			...columns.map(([, name]) => name),
			...benchmarkColumns.map(([, name]) => name),
		].join(","),
		...transitionCountries.flatMap((country) =>
			raw.years.map((year, index) =>
				[
					country.iso3,
					quote(country.name),
					quote(regionNames[country.region]),
					year,
					...columns.map(([key]) => values[key]?.[country.iso3]?.[index] ?? ""),
					...benchmarkColumns.map(([key]) => benchmarks[key]?.values[index] ?? ""),
				].join(","),
			),
		),
	];
	return new Response(`${lines.join("\n")}\n`, {
		headers: { "Content-Type": "text/csv; charset=utf-8" },
	});
};
