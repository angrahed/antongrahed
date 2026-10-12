// Project metadata for the projects index and detail pages. Repository stats and READMEs
// come from src/data/generated/github.json (refresh with `pnpm data:refresh`).
// Snippets are copied from each repository's README; never write code that isn't there.

export interface ProjectSnippet {
	/** "Install" or "Usage" */
	label: string;
	/** expressive-code / shiki language id */
	lang: string;
	code: string;
}

export interface Project {
	slug: string;
	/** Key into github.json `repos`, e.g. "angrahed/WBData.jl" */
	repo: string;
	title: string;
	summary: string;
	stack: string[];
	snippets: ProjectSnippet[];
}

export const projects: readonly Project[] = [
	{
		slug: "tradescrapr",
		repo: "angrahed/tradescrapr",
		title: "tradescrapr",
		summary:
			"A resumable UN Comtrade scraper for unattended targeted scrapes and monthly release monitoring.",
		stack: ["Python"],
		snippets: [
			{
				label: "Install",
				lang: "bash",
				code: `git clone https://github.com/angrahed/tradescrapr.git
cd tradescrapr
uv sync                        # creates .venv, installs pinned dependencies
uv run tradescrapr --version   # sanity check`,
			},
			{
				label: "Usage",
				lang: "bash",
				code: `uv run tradescrapr plan jobs/smoke.yaml --dry-run   # 4 tasks, nothing written
uv run tradescrapr plan jobs/smoke.yaml
uv run tradescrapr run
uv run tradescrapr status                            # expect 4/4 done`,
			},
		],
	},
	{
		slug: "ebrdo",
		repo: "angrahed/EBRDo",
		title: "EBRDo",
		summary:
			"A tool for harmonizing countries in the EBRD style across R, Julia, Stata, and Python.",
		stack: ["R", "Julia", "Stata", "Python"],
		snippets: [
			{
				label: "Install",
				lang: "r",
				code: `# install.packages("pak")
pak::pak("angrahed/EBRDo/r")`,
			},
			{
				label: "Usage",
				lang: "r",
				code: `library(EBRDo)
df <- data.frame(country = c("Kazakhstan", "Germany", "Kosovo"))
ebrdo(df)                                # country column auto-detected`,
			},
		],
	},
	{
		slug: "countrycodes-jl",
		repo: "angrahed/CountryCodes.jl",
		title: "CountryCodes.jl",
		summary:
			"A Julia port of R's countrycode package: convert between coding schemes and standardize country names.",
		stack: ["Julia"],
		snippets: [
			{
				label: "Install",
				lang: "julia",
				code: `using Pkg
Pkg.add(url="https://github.com/angrahed/CountryCodes.jl")`,
			},
			{
				label: "Usage",
				lang: "julia",
				code: `using CountryCodes

countrycode("USA", :iso3c => :cown)                    # -> 2
countrycode("Albania", :country_name_en => :iso3c)     # -> "ALB"
standardize_name("Deutschland")                        # -> "Germany"`,
			},
		],
	},
	{
		slug: "wbdata-jl",
		repo: "angrahed/WBData.jl",
		title: "WBData.jl",
		summary:
			"A Julia client for the World Bank Open Data API: paginated queries as tidy DataFrames, plus cached metadata and local search.",
		stack: ["Julia"],
		snippets: [
			{
				label: "Install",
				lang: "julia",
				code: "] add https://github.com/angrahed/WBData.jl",
			},
			{
				label: "Usage",
				lang: "julia",
				code: `using WBData

# Real countries (default), 1960 to 2023, joined with country metadata.
df = WBData.data("SP.POP.TOTL"; date = 1960:2023)`,
			},
		],
	},
];
