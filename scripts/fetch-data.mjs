/**
 * Snapshots the data the site renders at build time:
 *   - src/data/generated/transition.json  World Bank WDI series and V-Dem's liberal democracy index
 *                                         for 30 post-communist economies
 *   - src/data/generated/github.json      repository stats and READMEs for the projects
 *
 * Builds read these committed files, so a build never depends on either API being up.
 * Run from the repo root: GITHUB_TOKEN=$(gh auth token) node scripts/fetch-data.mjs
 * A file is only rewritten when its payload changed (the `retrieved` date alone never counts).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "src", "data", "generated");
const today = new Date().toISOString().slice(0, 10);

/* ---------- fetch with timeout + retries ---------- */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, { headers = {}, attempts = 5 } = {}) {
	let lastError;
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		try {
			const response = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
			if (response.ok) return response;
			const retryable = response.status >= 500 || response.status === 429;
			lastError = new Error(`${response.status} ${response.statusText} for ${url}`);
			if (!retryable) throw lastError;
		} catch (error) {
			lastError = error;
			if (error?.message?.startsWith("4")) throw error;
		}
		if (attempt < attempts - 1) {
			const wait = 2000 * 2 ** attempt;
			console.warn(`  retry ${attempt + 1} in ${wait / 1000}s: ${lastError?.message ?? lastError}`);
			await sleep(wait);
		}
	}
	throw lastError;
}

const fetchJson = async (url, options) => (await request(url, options)).json();

/* ---------- write only when the payload changed ---------- */

const withoutRetrieved = (value) => {
	if (!value || typeof value !== "object") return value;
	const copy = structuredClone(value);
	delete copy.retrieved;
	if (copy.source) delete copy.source.retrieved;
	for (const source of Object.values(copy.sources ?? {})) delete source.retrieved;
	return copy;
};

function writeIfChanged(file, payload, serialize) {
	const target = path.join(outDir, file);
	if (fs.existsSync(target)) {
		try {
			const text = fs.readFileSync(target, "utf8");
			const existing = JSON.parse(text);
			if (
				JSON.stringify(withoutRetrieved(existing)) === JSON.stringify(withoutRetrieved(payload))
			) {
				// Same data: keep the old `retrieved` date, but normalise the formatting.
				if (serialize(existing) !== text) fs.writeFileSync(target, serialize(existing));
				console.log(`unchanged ${path.relative(root, target)}`);
				return;
			}
		} catch {
			// Unreadable existing file: overwrite it.
		}
	}
	fs.mkdirSync(outDir, { recursive: true });
	fs.writeFileSync(target, serialize(payload));
	console.log(`wrote ${path.relative(root, target)}`);
}

/* ---------- World Bank ---------- */

const COUNTRIES = [
	"ALB",
	"ARM",
	"AZE",
	"BLR",
	"BIH",
	"BGR",
	"HRV",
	"CZE",
	"EST",
	"GEO",
	"HUN",
	"KAZ",
	"XKX",
	"KGZ",
	"LVA",
	"LTU",
	"MDA",
	"MNG",
	"MNE",
	"MKD",
	"POL",
	"ROU",
	"RUS",
	"SRB",
	"SVK",
	"SVN",
	"TJK",
	"TKM",
	"UKR",
	"UZB",
];

const INDICATORS = [
	{ code: "NY.GDP.PCAP.PP.KD", digits: 0, key: "gdppc" },
	{ code: "NY.GDP.MKTP.KD.ZG", digits: 2, key: "growth" },
	{ code: "FP.CPI.TOTL.ZG", digits: 2, key: "inflation" },
	{ code: "NY.GDP.DEFL.KD.ZG", digits: 2, key: "deflator" },
	{ code: "NE.TRD.GNFS.ZS", digits: 2, key: "trade" },
	{ code: "SP.DYN.LE00.IN", digits: 2, key: "lifeexp" },
];

/**
 * Advanced-economy benchmarks for the convergence view: GDP per capita (PPP) averaged
 * across members with population weights, i.e. total PPP GDP over total population.
 */
const BENCHMARKS = [
	{ key: "g7", members: ["CAN", "DEU", "FRA", "GBR", "ITA", "JPN", "USA"], name: "G7" },
	{ key: "usa", members: ["USA"], name: "United States" },
	{
		key: "eu15",
		members: [
			"AUT",
			"BEL",
			"DEU",
			"DNK",
			"ESP",
			"FIN",
			"FRA",
			"GBR",
			"GRC",
			"IRL",
			"ITA",
			"LUX",
			"NLD",
			"PRT",
			"SWE",
		],
		name: "Western Europe (EU-15)",
	},
];

const FIRST_YEAR = 1990;
const LAST_QUERY_YEAR = 2026;
const MIN_COUNTRIES_FOR_YEAR = 20;

const round = (value, digits) => {
	const factor = 10 ** digits;
	return Math.round(value * factor) / factor;
};

async function fetchIndicator({ code }, countries = COUNTRIES) {
	const url =
		`https://api.worldbank.org/v2/country/${countries.join(";")}/indicator/${code}` +
		`?format=json&date=${FIRST_YEAR}:${LAST_QUERY_YEAR}&per_page=20000`;
	const body = await fetchJson(url);
	if (!Array.isArray(body) || !Array.isArray(body[1])) {
		throw new Error(
			`Unexpected World Bank response for ${code}: ${JSON.stringify(body).slice(0, 200)}`,
		);
	}
	const [meta, rows] = body;
	if (meta.pages > 1) throw new Error(`${code} spans ${meta.pages} pages; raise per_page`);
	return { lastUpdated: meta.lastupdated, rows };
}

/* ---------- V-Dem (via Our World in Data) ---------- */

/**
 * V-Dem's liberal democracy index (v2x_libdem), read from Our World in Data's copy:
 * the full V-Dem release is a dataset of several hundred megabytes. OWID codes Kosovo OWID_KOS.
 */
const VDEM = {
	codes: { OWID_KOS: "XKX" },
	column: "libdem_vdem__estimate_best",
	csv: "https://ourworldindata.org/grapher/liberal-democracy-index.csv?v=1&csvType=full&useColumnShortNames=true",
	metadata:
		"https://ourworldindata.org/grapher/liberal-democracy-index.metadata.json?v=1&csvType=full&useColumnShortNames=true",
};

async function fetchVdem(years) {
	const [csv, metadata] = await Promise.all([
		request(VDEM.csv).then((response) => response.text()),
		fetchJson(VDEM.metadata),
	]);
	const [header = "", ...lines] = csv.trim().split("\n");
	// Entity names can hold quoted commas, so columns are counted from the end of each line.
	const fromEnd = (name) => {
		const columns = header.split(",");
		const index = columns.indexOf(name);
		if (index === -1) throw new Error(`OWID V-Dem CSV has no ${name} column: ${header}`);
		return index - columns.length;
	};
	const [codeAt, yearAt, valueAt] = ["code", "year", VDEM.column].map(fromEnd);
	const table = {};
	for (const line of lines) {
		const cells = line.split(",");
		const code = cells.at(codeAt);
		const iso = VDEM.codes[code] ?? code;
		const value = Number.parseFloat(cells.at(valueAt));
		if (!COUNTRIES.includes(iso) || !Number.isFinite(value)) continue;
		table[iso] ??= {};
		table[iso][Number(cells.at(yearAt))] = round(value, 3);
	}
	const missing = COUNTRIES.filter((iso) => !table[iso]);
	if (missing.length) throw new Error(`No V-Dem rows for ${missing.join(", ")}`);

	const column = metadata.columns?.[VDEM.column] ?? {};
	const version = /\bv(\d+)\b/.exec(column.citationLong ?? "")?.[1];
	return {
		indicator: { code: "v2x_libdem", name: column.titleLong ?? "Liberal democracy index - V-Dem" },
		source: {
			name: `V-Dem${version ? ` v${version}` : ""} via Our World in Data`,
			url: "https://ourworldindata.org/grapher/liberal-democracy-index",
			citation: column.citationLong ?? column.citationShort ?? "V-Dem",
			lastUpdated: column.lastUpdated,
			retrieved: today,
		},
		values: Object.fromEntries(
			COUNTRIES.map((iso) => [iso, years.map((year) => table[iso]?.[year] ?? null)]),
		),
	};
}

async function buildTransition() {
	console.log("World Bank WDI");
	const results = [];
	for (const indicator of INDICATORS) {
		console.log(`  ${indicator.code}`);
		results.push({ indicator, ...(await fetchIndicator(indicator)) });
	}

	const wbNames = {};
	const raw = {};
	for (const { indicator, rows } of results) {
		raw[indicator.key] = {};
		for (const row of rows) {
			const iso = row.countryiso3code;
			if (!COUNTRIES.includes(iso)) continue;
			wbNames[iso] ??= row.country.value;
			if (row.value === null || row.value === undefined) continue;
			raw[indicator.key][iso] ??= {};
			raw[indicator.key][iso][Number(row.date)] = round(row.value, indicator.digits);
		}
	}

	let lastYear = FIRST_YEAR;
	for (let year = FIRST_YEAR; year <= LAST_QUERY_YEAR; year += 1) {
		const covered = COUNTRIES.filter((iso) => raw.gdppc[iso]?.[year] !== undefined).length;
		if (covered >= MIN_COUNTRIES_FOR_YEAR) lastYear = year;
	}
	const years = Array.from({ length: lastYear - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);

	const missingNames = COUNTRIES.filter((iso) => !wbNames[iso]);
	if (missingNames.length) throw new Error(`No World Bank rows for ${missingNames.join(", ")}`);

	const indicators = {};
	const values = {};
	for (const { indicator, rows } of results) {
		indicators[indicator.key] = {
			code: indicator.code,
			name: rows.find((row) => row.indicator?.value)?.indicator.value ?? indicator.code,
		};
		values[indicator.key] = {};
		for (const iso of COUNTRIES) {
			values[indicator.key][iso] = years.map((year) => raw[indicator.key][iso]?.[year] ?? null);
		}
	}

	// Benchmarks: every member needs both series in a year, otherwise the year is left empty.
	console.log("  benchmarks");
	const benchmarkCountries = [...new Set(BENCHMARKS.flatMap((benchmark) => benchmark.members))];
	const memberSeries = {};
	for (const [key, code] of [
		["gdppc", "NY.GDP.PCAP.PP.KD"],
		["population", "SP.POP.TOTL"],
	]) {
		const { lastUpdated: updated, rows } = await fetchIndicator({ code }, benchmarkCountries);
		results.push({ lastUpdated: updated });
		memberSeries[key] = {};
		for (const row of rows) {
			if (row.value === null || row.value === undefined) continue;
			memberSeries[key][row.countryiso3code] ??= {};
			memberSeries[key][row.countryiso3code][Number(row.date)] = row.value;
		}
	}
	const benchmarks = Object.fromEntries(
		BENCHMARKS.map(({ key, members, name }) => [
			key,
			{
				members,
				name,
				values: years.map((year) => {
					let output = 0;
					let people = 0;
					for (const iso of members) {
						const perHead = memberSeries.gdppc[iso]?.[year];
						const population = memberSeries.population[iso]?.[year];
						if (perHead === undefined || population === undefined) return null;
						output += perHead * population;
						people += population;
					}
					return round(output / people, 0);
				}),
			},
		]),
	);

	console.log("V-Dem via Our World in Data");
	const vdem = await fetchVdem(years);
	indicators.libdem = vdem.indicator;
	values.libdem = vdem.values;

	const lastUpdated = results
		.map((result) => result.lastUpdated)
		.filter(Boolean)
		.sort()
		.at(-1);

	return {
		source: {
			name: "World Bank, World Development Indicators",
			url: "https://data.worldbank.org/",
			lastUpdated,
			retrieved: today,
		},
		years,
		indicators,
		countries: Object.fromEntries(COUNTRIES.map((iso) => [iso, { wbName: wbNames[iso] }])),
		values,
		benchmarks,
		sources: { vdem: vdem.source },
	};
}

// Pretty-print the structure but keep every series array and flat object on a single line.
// Only line breaks and indentation are removed, so spaces inside strings survive
// (JSON strings never contain raw newlines).
function serializeTransition(payload) {
	return `${JSON.stringify(payload, null, "\t")
		.replace(/\[\s*([^\][{}]*?)\s*\]/g, (_, inner) => `[${inner.replace(/\n\s*/g, "")}]`)
		.replace(
			/\{\n\t+([^{}[\]]*?)\n\t*\}/g,
			(_, inner) => `{ ${inner.replace(/\n\t+/g, " ")} }`,
		)}\n`;
}

/* ---------- GitHub ---------- */

const REPOS = [
	"angrahed/tradescrapr",
	"angrahed/EBRDo",
	"angrahed/CountryCodes.jl",
	"angrahed/WBData.jl",
];

const githubHeaders = (accept = "application/vnd.github+json") => ({
	Accept: accept,
	"User-Agent": "antongrahed.com-data-snapshot",
	"X-GitHub-Api-Version": "2022-11-28",
	...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
});

const gh = (endpoint, accept) =>
	request(`https://api.github.com${endpoint}`, { headers: githubHeaders(accept) });

async function ghJsonOrNull(endpoint) {
	try {
		return await (await gh(endpoint)).json();
	} catch (error) {
		if (String(error?.message).startsWith("404")) return null;
		throw error;
	}
}

const lastPageFromLink = (link) => {
	const match = link?.match(/[?&]page=(\d+)[^>]*>;\s*rel="last"/);
	return match ? Number(match[1]) : null;
};

function cleanReadme(html, fullName, branch, title) {
	let out = html.trim();

	// Unwrap `<div id="readme"><article class="markdown-body">…</article></div>`.
	for (;;) {
		const wrapper = out.match(/^<(article|div)\b[^>]*>([\s\S]*)<\/\1>$/);
		if (!wrapper) break;
		out = wrapper[2].trim();
	}

	// GitHub puts each heading's id on a sibling permalink anchor. Move the id onto the
	// heading (without the `user-content-` prefix, so in-README `#section` links resolve),
	// then drop the anchor and its octicon SVG.
	out = out.replace(
		/<div class="markdown-heading"[^>]*>\s*<(h[1-6])\b([^>]*)>([\s\S]*?)<\/\1>\s*(<a\b[^>]*>[\s\S]*?<\/a>)?\s*<\/div>/g,
		(_, tag, attributes, inner, anchor) => {
			const id = anchor?.match(/\bid="(?:user-content-)?([^"]+)"/)?.[1];
			const cleanAttributes = attributes.replace(/\s*class="heading-element"/, "");
			return `<${tag}${cleanAttributes}${id ? ` id="${id}"` : ""}>${inner}</${tag}>`;
		},
	);
	out = out.replace(/<a\b[^>]*class="anchor"[^>]*>[\s\S]*?<\/a>/g, "");

	// Remove a leading <h1> that only repeats the repository name.
	const firstHeading = out.match(/^\s*<h1\b[^>]*>([\s\S]*?)<\/h1>\s*/);
	if (firstHeading) {
		const text = firstHeading[1]
			.replace(/<[^>]+>/g, "")
			.trim()
			.toLowerCase();
		const repoName = fullName.split("/")[1].toLowerCase();
		if (text === repoName || text === title.toLowerCase()) out = out.slice(firstHeading[0].length);
	}

	const isRelative = (url) => !/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(url);
	const clean = (url) => url.replace(/^\.\//, "").replace(/^\//, "");
	out = out.replace(/\bhref="([^"]*)"/g, (match, url) =>
		url && isRelative(url)
			? `href="https://github.com/${fullName}/blob/${branch}/${clean(url)}"`
			: match,
	);
	out = out.replace(/\bsrc="([^"]*)"/g, (match, url) =>
		url && isRelative(url)
			? `src="https://raw.githubusercontent.com/${fullName}/${branch}/${clean(url)}"`
			: match,
	);

	return `${out.trim()}\n`;
}

async function fetchRepo(fullName) {
	console.log(`  ${fullName}`);
	const repo = await (await gh(`/repos/${fullName}`)).json();
	const branch = repo.default_branch;

	const languagesRaw = await (await gh(`/repos/${fullName}/languages`)).json();
	const totalBytes = Object.values(languagesRaw).reduce((sum, bytes) => sum + bytes, 0);
	const languages = Object.entries(languagesRaw)
		.map(([name, bytes]) => ({
			name,
			bytes,
			share: totalBytes ? Math.round((bytes / totalBytes) * 10_000) / 10_000 : 0,
		}))
		.sort((a, b) => b.bytes - a.bytes);

	const release = await ghJsonOrNull(`/repos/${fullName}/releases/latest`);
	const tags = (await ghJsonOrNull(`/repos/${fullName}/tags?per_page=1`)) ?? [];

	const commitsResponse = await gh(
		`/repos/${fullName}/commits?sha=${encodeURIComponent(branch)}&per_page=1`,
	);
	const [latest] = await commitsResponse.json();
	const totalCommits = lastPageFromLink(commitsResponse.headers.get("link")) ?? (latest ? 1 : 0);

	const readmeResponse = await gh(`/repos/${fullName}/readme`, "application/vnd.github.html+json");
	const readmeHtml = cleanReadme(await readmeResponse.text(), fullName, branch, repo.name);

	return {
		fullName: repo.full_name,
		url: repo.html_url,
		description: repo.description,
		homepage: repo.homepage || null,
		license:
			repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION" ? repo.license.spdx_id : null,
		stars: repo.stargazers_count,
		forks: repo.forks_count,
		openIssues: repo.open_issues_count,
		defaultBranch: branch,
		createdAt: repo.created_at,
		pushedAt: repo.pushed_at,
		languages,
		latestRelease: release
			? {
					tag: release.tag_name,
					name: release.name || release.tag_name,
					publishedAt: release.published_at,
					url: release.html_url,
				}
			: null,
		latestTag: tags[0]?.name ?? null,
		totalCommits,
		lastCommit: latest
			? {
					sha: latest.sha.slice(0, 7),
					message: latest.commit.message.split("\n")[0],
					date: latest.commit.committer?.date ?? latest.commit.author?.date,
					url: latest.html_url,
				}
			: null,
		readmeHtml,
	};
}

async function buildGithub() {
	console.log(`GitHub${process.env.GITHUB_TOKEN ? "" : " (unauthenticated: 60 requests/hour)"}`);
	const repos = {};
	for (const fullName of REPOS) repos[fullName] = await fetchRepo(fullName);
	return { retrieved: today, repos };
}

/* ---------- main ---------- */

const failures = [];

try {
	writeIfChanged("transition.json", await buildTransition(), serializeTransition);
} catch (error) {
	failures.push(`World Bank: ${error.message}`);
}

try {
	writeIfChanged(
		"github.json",
		await buildGithub(),
		(payload) => `${JSON.stringify(payload, null, "\t")}\n`,
	);
} catch (error) {
	failures.push(`GitHub: ${error.message}`);
}

if (failures.length) {
	console.error(`\nSnapshot incomplete; existing files were kept:\n  ${failures.join("\n  ")}`);
	process.exit(1);
}
